#!/usr/bin/env python3
"""Incrementally synchronize CourtListener clusters, opinions, and content."""

from __future__ import annotations

import argparse
import logging
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urljoin

from dotenv import load_dotenv
from sync_common import (
    DEFAULT_TIMEOUT,
    RateLimiter,
    RunStats,
    UpstreamAPIError,
    build_http_session,
    create_supabase_client,
    get_json,
    iter_next_paginated_items,
    require_env,
    upload_bytes,
    upsert_preserving_missing,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

BASE_URL = "https://www.courtlistener.com/api/rest/v4"
STORAGE_BASE_URL = "https://storage.courtlistener.com/"
DEFAULT_MINIMUM_REQUEST_INTERVAL = 72.0
DEFAULT_MAX_API_REQUESTS = 120
DEFAULT_INITIAL_LOOKBACK_DAYS = 14
DEFAULT_OVERLAP_MINUTES = 30
CLUSTER_FIELDS = ",".join(
    (
        "id",
        "slug",
        "case_name",
        "case_name_short",
        "date_filed",
        "date_modified",
        "judges",
    )
)
OPINION_FIELDS = ",".join(
    (
        "id",
        "cluster",
        "cluster_id",
        "author",
        "joined_by",
        "date_modified",
        "type",
        "sha1",
        "local_path",
        "download_url",
        "html_with_citations",
        "plain_text",
    )
)


class CourtListenerQuotaLimiter(RateLimiter):
    """Pace API calls for the default hourly quota and cap each run."""

    def __init__(
        self, minimum_interval_seconds: float, max_requests_per_run: int
    ) -> None:
        super().__init__(minimum_interval_seconds)
        self.max_requests_per_run = max(1, max_requests_per_run)
        self.request_count = 0

    def wait(self) -> None:
        if self.request_count >= self.max_requests_per_run:
            raise UpstreamAPIError(
                "CourtListener API request budget exhausted "
                f"({self.max_requests_per_run} requests in this run)"
            )
        super().wait()
        self.request_count += 1


class CourtListenerClient:
    def __init__(
        self,
        api_key: str,
        *,
        minimum_request_interval: float = DEFAULT_MINIMUM_REQUEST_INTERVAL,
        max_api_requests: int = DEFAULT_MAX_API_REQUESTS,
    ) -> None:
        self.session = build_http_session(
            headers={"Accept": "application/json", "Authorization": f"Token {api_key}"}
        )
        # Never forward the CourtListener token to a court or storage host.
        self.download_session = build_http_session()
        self.rate_limiter = CourtListenerQuotaLimiter(
            minimum_request_interval, max_api_requests
        )
        self._people: Dict[str, Dict[str, Any]] = {}

    def clusters(
        self,
        court_id: str,
        *,
        modified_since: str,
        per_page: int,
        max_pages: Optional[int],
    ) -> List[Dict[str, Any]]:
        return list(
            iter_next_paginated_items(
                self.session,
                f"{BASE_URL}/clusters/",
                "results",
                params={
                    "docket__court": court_id,
                    "date_modified__gte": modified_since,
                    "fields": CLUSTER_FIELDS,
                    "order_by": "date_modified,id",
                    "page_size": per_page,
                },
                max_pages=max_pages,
                rate_limiter=self.rate_limiter,
            )
        )

    def opinions(
        self,
        court_id: str,
        *,
        modified_since: str,
        per_page: int,
        max_pages: Optional[int],
    ) -> List[Dict[str, Any]]:
        return list(
            iter_next_paginated_items(
                self.session,
                f"{BASE_URL}/opinions/",
                "results",
                params={
                    "cluster__docket__court": court_id,
                    "date_modified__gte": modified_since,
                    "fields": OPINION_FIELDS,
                    "order_by": "date_modified,id",
                    "page_size": per_page,
                },
                max_pages=max_pages,
                rate_limiter=self.rate_limiter,
            )
        )

    def detail_from_url(self, url: str) -> Dict[str, Any]:
        return get_json(self.session, url, rate_limiter=self.rate_limiter)

    def cluster_detail(self, cluster_id: Any) -> Dict[str, Any]:
        return self.detail_from_url(f"{BASE_URL}/clusters/{cluster_id}/")

    def person(self, url: str) -> Dict[str, Any]:
        person_id = remote_id_from_url(url)
        if person_id not in self._people:
            self._people[person_id] = self.detail_from_url(
                f"{BASE_URL}/people/{person_id}/"
            )
        return self._people[person_id]

    def download(self, url: str) -> tuple[bytes, str]:
        try:
            response = self.download_session.get(url, timeout=DEFAULT_TIMEOUT)
            response.raise_for_status()
        except Exception as exc:
            raise UpstreamAPIError(f"Failed to download {url}: {exc}") from exc
        return response.content, response.headers.get(
            "content-type", "application/octet-stream"
        )


def remote_id_from_url(url: str) -> str:
    return url.rstrip("/").split("/")[-1]


def parse_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def incremental_start(
    newest_stored: Optional[str], *, initial_lookback_days: int, overlap_minutes: int
) -> str:
    if newest_stored:
        start = parse_timestamp(newest_stored) - timedelta(minutes=overlap_minutes)
    else:
        start = datetime.now(timezone.utc) - timedelta(days=initial_lookback_days)
    return start.isoformat()


def newest_source_modified(supabase: Any, table: str) -> Optional[str]:
    result = (
        supabase.table(table)
        .select("source_date_modified")
        .gte("source_date_modified", "1970-01-01T00:00:00+00:00")
        .order("source_date_modified", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    value = result.data[0].get("source_date_modified")
    return str(value) if value else None


def court_id_for_remote_id(supabase: Any, remote_id: str) -> str:
    result = supabase.table("court").select("id").eq("remote_id", remote_id).execute()
    if not result.data:
        raise RuntimeError(f"Court {remote_id} has not been synchronized")
    return result.data[0]["id"]


def cluster_for_remote_id(supabase: Any, remote_id: str) -> Optional[Dict[str, Any]]:
    result = (
        supabase.table("cluster")
        .select("id,date_filed")
        .eq("remote_id", remote_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def upsert_cluster(supabase: Any, court_id: str, detail: Dict[str, Any]) -> str:
    remote_id = detail.get("id")
    if remote_id is None:
        raise UpstreamAPIError("Cluster is missing id")
    row = {
        "remote_id": str(remote_id),
        "court_id": court_id,
        "slug": detail.get("slug") or "",
        "case_name": detail.get("case_name") or "",
        "case_name_short": detail.get("case_name_short") or "",
        "date_filed": detail.get("date_filed"),
        "judges": detail.get("judges"),
        "source_date_modified": detail.get("date_modified"),
    }
    result = supabase.table("cluster").upsert(row, on_conflict="remote_id").execute()
    if not result.data:
        raise RuntimeError(f"Cluster upsert returned no ID for {remote_id}")
    return result.data[0]["id"]


def judge_name(person: Dict[str, Any]) -> str:
    return " ".join(
        part
        for part in (
            person.get("name_first"),
            person.get("name_middle"),
            person.get("name_last"),
            person.get("name_suffix"),
        )
        if part
    )


def upsert_judge(supabase: Any, person: Dict[str, Any]) -> str:
    remote_id = person.get("id")
    if remote_id is None:
        raise UpstreamAPIError("Judge detail is missing id")
    row = {
        "remote_id": str(remote_id),
        "first_name": person.get("name_first") or "",
        "middle_name": person.get("name_middle") or "",
        "last_name": person.get("name_last") or "",
        "suffix": person.get("name_suffix") or "",
        "full_name": judge_name(person),
    }
    result = supabase.table("judge").upsert(row, on_conflict="remote_id").execute()
    if not result.data:
        raise RuntimeError(f"Judge upsert returned no ID for {remote_id}")
    return result.data[0]["id"]


def judge_id(supabase: Any, client: CourtListenerClient, url: str) -> str:
    remote_id = remote_id_from_url(url)
    existing = (
        supabase.table("judge")
        .select("id")
        .eq("remote_id", remote_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]["id"]
    return upsert_judge(supabase, client.person(url))


def _judge_ids(
    supabase: Any, client: CourtListenerClient, urls: Iterable[str]
) -> List[str]:
    return [judge_id(supabase, client, url) for url in urls]


def existing_opinion(supabase: Any, remote_id: str) -> Optional[Dict[str, Any]]:
    result = (
        supabase.table("court_opinion")
        .select(
            "id,source_date_modified,source_sha1,"
            "pdf_file_path,html_file_path,text_file_path"
        )
        .eq("remote_id", remote_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _pdf_source_urls(opinion: Dict[str, Any]) -> List[str]:
    urls: List[str] = []
    if opinion.get("local_path"):
        urls.append(urljoin(STORAGE_BASE_URL, str(opinion["local_path"]).lstrip("/")))
    if opinion.get("download_url") and opinion["download_url"] not in urls:
        urls.append(str(opinion["download_url"]))
    return urls


def _download_pdf(
    client: CourtListenerClient, opinion: Dict[str, Any]
) -> Optional[tuple[bytes, str]]:
    for url in _pdf_source_urls(opinion):
        try:
            content, content_type = client.download(url)
            if b"%PDF-" not in content[:1024]:
                raise UpstreamAPIError(
                    f"Downloaded content is not a PDF ({content_type})"
                )
            return content, "application/pdf"
        except UpstreamAPIError as exc:
            logger.warning("Could not use opinion PDF %s: %s", url, exc)
    return None


def upload_opinion_content(
    supabase: Any,
    client: CourtListenerClient,
    opinion: Dict[str, Any],
    filed_date: str,
) -> Dict[str, str]:
    opinion_id = opinion.get("id")
    if opinion_id is None or not filed_date:
        raise UpstreamAPIError("Opinion is missing id or its cluster filing date")
    safe_date = re.sub(r"[^0-9-]", "", filed_date)
    try:
        year, month, day = safe_date.split("-")
    except ValueError as exc:
        raise UpstreamAPIError(f"Invalid cluster filing date: {filed_date}") from exc
    source_sha1 = opinion.get("sha1")
    revision = (
        re.sub(r"[^a-fA-F0-9]", "", str(source_sha1))
        if source_sha1
        else "latest"
    )
    base_path = f"opinions/{year}/{month}/{day}/{opinion_id}/{revision}"
    paths: Dict[str, str] = {}

    pdf_urls = _pdf_source_urls(opinion)
    pdf = _download_pdf(client, opinion)
    if pdf_urls and not pdf:
        raise UpstreamAPIError(
            f"No valid PDF could be downloaded for opinion {opinion_id}"
        )
    if pdf:
        content, content_type = pdf
        paths["pdf_file_path"] = upload_bytes(
            supabase, "opinions", f"{base_path}.pdf", content, content_type
        )
    for source_key, path_key, extension, content_type in (
        ("html_with_citations", "html_file_path", "html", "text/html"),
        ("plain_text", "text_file_path", "txt", "text/plain"),
    ):
        content = opinion.get(source_key)
        if content:
            paths[path_key] = upload_bytes(
                supabase,
                "opinions",
                f"{base_path}.{extension}",
                str(content).encode("utf-8"),
                content_type,
            )
    return paths


def _cluster_remote_id(opinion: Dict[str, Any]) -> str:
    if opinion.get("cluster_id") is not None:
        return str(opinion["cluster_id"])
    if opinion.get("cluster"):
        return remote_id_from_url(str(opinion["cluster"]))
    raise UpstreamAPIError(f"Opinion {opinion.get('id')} is missing its cluster")


def opinion_content_is_current(
    previous: Optional[Dict[str, Any]], opinion: Dict[str, Any]
) -> bool:
    revision_matches = bool(
        previous
        and (
            (
                opinion.get("sha1")
                and previous.get("source_sha1") == opinion.get("sha1")
            )
            or (
                not opinion.get("sha1")
                and previous.get("source_date_modified")
                == opinion.get("date_modified")
            )
        )
    )
    expected_content_exists = bool(
        previous
        and (not _pdf_source_urls(opinion) or previous.get("pdf_file_path"))
        and (
            not opinion.get("html_with_citations")
            or previous.get("html_file_path")
        )
        and (not opinion.get("plain_text") or previous.get("text_file_path"))
    )
    return revision_matches and expected_content_exists


def sync_opinion(
    supabase: Any,
    client: CourtListenerClient,
    court_id: str,
    opinion: Dict[str, Any],
    *,
    skip_storage: bool,
) -> Dict[str, Any]:
    remote_id = opinion.get("id")
    if remote_id is None:
        raise UpstreamAPIError("Opinion is missing id")

    cluster_remote_id = _cluster_remote_id(opinion)
    cluster = cluster_for_remote_id(supabase, cluster_remote_id)
    if not cluster:
        detail = client.cluster_detail(cluster_remote_id)
        cluster_id = upsert_cluster(supabase, court_id, detail)
        cluster = {"id": cluster_id, "date_filed": detail.get("date_filed")}
    filed_date = cluster.get("date_filed")
    if not filed_date:
        raise UpstreamAPIError(f"Cluster {cluster_remote_id} is missing date_filed")

    author_id = None
    if opinion.get("author"):
        author_id = judge_id(supabase, client, str(opinion["author"]))
    joined_by = _judge_ids(supabase, client, opinion.get("joined_by") or [])
    row: Dict[str, Any] = {
        "remote_id": str(remote_id),
        "date": filed_date,
        "author_id": author_id,
        "cluster_id": cluster["id"],
        "type": opinion.get("type") or "",
        "joined_by": joined_by or None,
        "source_date_modified": opinion.get("date_modified"),
        "source_sha1": opinion.get("sha1"),
        "source_local_path": opinion.get("local_path"),
    }

    previous = existing_opinion(supabase, str(remote_id))
    content_is_current = opinion_content_is_current(previous, opinion)
    if not skip_storage and not content_is_current:
        row.update(upload_opinion_content(supabase, client, opinion, str(filed_date)))
    result = upsert_preserving_missing(supabase, "court_opinion", row, "remote_id")
    if not result.data:
        raise RuntimeError(f"Opinion upsert returned no ID for {remote_id}")
    return result.data[0]


def sync_opinions_to_supabase(
    supabase: Any,
    client: CourtListenerClient,
    *,
    court_remote_id: str = "scotus",
    per_page: int = 20,
    max_pages: Optional[int] = None,
    skip_storage: bool = False,
    initial_lookback_days: int = DEFAULT_INITIAL_LOOKBACK_DAYS,
    overlap_minutes: int = DEFAULT_OVERLAP_MINUTES,
) -> RunStats:
    court_id = court_id_for_remote_id(supabase, court_remote_id)
    cluster_since = incremental_start(
        newest_source_modified(supabase, "cluster"),
        initial_lookback_days=initial_lookback_days,
        overlap_minutes=overlap_minutes,
    )
    opinion_since = incremental_start(
        newest_source_modified(supabase, "court_opinion"),
        initial_lookback_days=initial_lookback_days,
        overlap_minutes=overlap_minutes,
    )
    logger.info(
        "Fetching CourtListener updates court=%s cluster_since=%s opinion_since=%s",
        court_remote_id, cluster_since, opinion_since,
    )

    clusters = client.clusters(
        court_remote_id,
        modified_since=cluster_since,
        per_page=per_page,
        max_pages=max_pages,
    )
    opinions = client.opinions(
        court_remote_id,
        modified_since=opinion_since,
        per_page=per_page,
        max_pages=max_pages,
    )
    stats = RunStats(fetched=len(clusters) + len(opinions))

    for cluster in clusters:
        try:
            upsert_cluster(supabase, court_id, cluster)
        except Exception as exc:
            stats.failed += 1
            logger.exception("Failed to sync cluster %s: %s", cluster.get("id"), exc)
            # Items are oldest-first. Stop so a later success cannot move the
            # derived checkpoint past this failed record.
            break
    for opinion in opinions:
        try:
            sync_opinion(
                supabase, client, court_id, opinion, skip_storage=skip_storage
            )
            stats.written += 1
        except Exception as exc:
            stats.failed += 1
            logger.exception("Failed to sync opinion %s: %s", opinion.get("id"), exc)
            break
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--court-id", default="scotus")
    parser.add_argument("--per-page", type=int, default=20)
    parser.add_argument("--max-pages", type=int, default=5)
    parser.add_argument("--skip-storage", action="store_true")
    parser.add_argument(
        "--initial-lookback-days", type=int, default=DEFAULT_INITIAL_LOOKBACK_DAYS
    )
    parser.add_argument("--overlap-minutes", type=int, default=DEFAULT_OVERLAP_MINUTES)
    parser.add_argument(
        "--minimum-request-interval",
        type=float,
        default=None,
        help="Seconds between CourtListener API calls (default: 72)",
    )
    parser.add_argument(
        "--max-api-requests",
        type=int,
        default=None,
        help="Maximum CourtListener API calls per run (default: 120)",
    )
    args = parser.parse_args()

    load_dotenv()
    minimum_request_interval = args.minimum_request_interval
    if minimum_request_interval is None:
        minimum_request_interval = float(
            os.getenv(
                "COURT_LISTENER_MINIMUM_REQUEST_INTERVAL",
                str(DEFAULT_MINIMUM_REQUEST_INTERVAL),
            )
        )
    max_api_requests = args.max_api_requests
    if max_api_requests is None:
        max_api_requests = int(
            os.getenv("COURT_LISTENER_MAX_API_REQUESTS", str(DEFAULT_MAX_API_REQUESTS))
        )
    try:
        stats = sync_opinions_to_supabase(
            create_supabase_client(),
            CourtListenerClient(
                require_env("COURT_LISTENER_API_KEY"),
                minimum_request_interval=minimum_request_interval,
                max_api_requests=max_api_requests,
            ),
            court_remote_id=args.court_id,
            per_page=args.per_page,
            max_pages=args.max_pages,
            skip_storage=args.skip_storage,
            initial_lookback_days=max(1, args.initial_lookback_days),
            overlap_minutes=max(0, args.overlap_minutes),
        )
    except Exception as exc:
        logger.exception("Court opinion sync failed: %s", exc)
        return 1
    stats.log("court-opinions")
    return 1 if stats.failed else 0


if __name__ == "__main__":
    sys.exit(main())
