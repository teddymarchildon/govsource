#!/usr/bin/env python3
"""Synchronize CourtListener clusters, judges, opinions, and content."""

from __future__ import annotations

import argparse
import logging
import re
import sys
from typing import Any, Dict, Iterable, List, Optional

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
RATE_LIMITER = RateLimiter(1.0)


class CourtListenerClient:
    def __init__(self, api_key: str) -> None:
        self.session = build_http_session(headers={"Authorization": f"Token {api_key}"})
        self._people: Dict[str, Dict[str, Any]] = {}

    def clusters(
        self, court_id: str, *, per_page: int, max_pages: Optional[int]
    ) -> List[Dict[str, Any]]:
        return list(
            iter_next_paginated_items(
                self.session,
                f"{BASE_URL}/clusters/",
                "results",
                params={
                    "docket__court": court_id,
                    "order_by": "-date_filed",
                    "page_size": per_page,
                },
                max_pages=max_pages,
                rate_limiter=RATE_LIMITER,
            )
        )

    def detail_from_url(self, url: str) -> Dict[str, Any]:
        return get_json(self.session, url, rate_limiter=RATE_LIMITER)

    def cluster_detail(self, cluster_id: Any) -> Dict[str, Any]:
        return self.detail_from_url(f"{BASE_URL}/clusters/{cluster_id}/")

    def opinion(self, url: str) -> Dict[str, Any]:
        opinion_id = url.rstrip("/").split("/")[-1]
        return self.detail_from_url(f"{BASE_URL}/opinions/{opinion_id}/")

    def person(self, url: str) -> Dict[str, Any]:
        person_id = url.rstrip("/").split("/")[-1]
        if person_id not in self._people:
            self._people[person_id] = self.detail_from_url(
                f"{BASE_URL}/people/{person_id}/"
            )
        return self._people[person_id]

    def download(self, url: str) -> tuple[bytes, str]:
        RATE_LIMITER.wait()
        try:
            response = self.session.get(url, timeout=DEFAULT_TIMEOUT)
            response.raise_for_status()
        except Exception as exc:
            raise UpstreamAPIError(f"Failed to download {url}: {exc}") from exc
        return response.content, response.headers.get("content-type", "application/pdf")


def court_id_for_remote_id(supabase: Any, remote_id: str) -> str:
    result = supabase.table("court").select("id").eq("remote_id", remote_id).execute()
    if not result.data:
        raise RuntimeError(f"Court {remote_id} has not been synchronized")
    return result.data[0]["id"]


def upsert_cluster(supabase: Any, court_id: str, detail: Dict[str, Any]) -> str:
    remote_id = detail.get("id")
    if remote_id is None:
        raise UpstreamAPIError("Cluster detail is missing id")
    row = {
        "remote_id": str(remote_id),
        "court_id": court_id,
        "slug": detail.get("slug") or "",
        "case_name": detail.get("case_name") or "",
        "case_name_short": detail.get("case_name_short") or "",
        "date_filed": detail.get("date_filed"),
        "judges": detail.get("judges"),
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
    year, month, day = safe_date.split("-")
    base_path = f"opinions/{year}/{month}/{day}/{opinion_id}"
    paths: Dict[str, str] = {}

    if opinion.get("download_url"):
        content, content_type = client.download(opinion["download_url"])
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


def _judge_ids(
    supabase: Any, client: CourtListenerClient, urls: Iterable[str]
) -> List[str]:
    return [upsert_judge(supabase, client.person(url)) for url in urls]


def sync_opinion(
    supabase: Any,
    client: CourtListenerClient,
    cluster_id: str,
    filed_date: str,
    opinion_url: str,
    *,
    skip_storage: bool,
) -> Dict[str, Any]:
    opinion = client.opinion(opinion_url)
    remote_id = opinion.get("id")
    if remote_id is None:
        raise UpstreamAPIError("Opinion detail is missing id")
    author_id = None
    if opinion.get("author"):
        author_id = upsert_judge(supabase, client.person(opinion["author"]))
    joined_by = _judge_ids(supabase, client, opinion.get("joined_by") or [])
    row: Dict[str, Any] = {
        "remote_id": str(remote_id),
        "date": filed_date,
        "author_id": author_id,
        "cluster_id": cluster_id,
        "type": opinion.get("type") or "",
        "joined_by": joined_by or None,
    }
    if not skip_storage:
        row.update(upload_opinion_content(supabase, client, opinion, filed_date))
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
) -> RunStats:
    clusters = client.clusters(court_remote_id, per_page=per_page, max_pages=max_pages)
    stats = RunStats(fetched=len(clusters))
    court_id = court_id_for_remote_id(supabase, court_remote_id)
    for cluster in clusters:
        try:
            remote_id = cluster.get("id")
            if remote_id is None:
                raise UpstreamAPIError("Cluster list item is missing id")
            detail = client.cluster_detail(remote_id)
            cluster_id = upsert_cluster(supabase, court_id, detail)
            filed_date = detail.get("date_filed")
            if not filed_date:
                raise UpstreamAPIError(f"Cluster {remote_id} is missing date_filed")
            opinion_urls = (
                detail.get("sub_opinions") or cluster.get("sub_opinions") or []
            )
            for opinion_url in opinion_urls:
                sync_opinion(
                    supabase,
                    client,
                    cluster_id,
                    filed_date,
                    opinion_url,
                    skip_storage=skip_storage,
                )
                stats.written += 1
            if not opinion_urls:
                stats.skipped += 1
        except Exception as exc:
            stats.failed += 1
            logger.exception("Failed to sync cluster %s: %s", cluster.get("id"), exc)
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--court-id", default="scotus")
    parser.add_argument("--per-page", type=int, default=20)
    parser.add_argument("--max-pages", type=int, default=50)
    parser.add_argument("--skip-storage", action="store_true")
    args = parser.parse_args()

    load_dotenv()
    try:
        stats = sync_opinions_to_supabase(
            create_supabase_client(),
            CourtListenerClient(require_env("COURT_LISTENER_API_KEY")),
            court_remote_id=args.court_id,
            per_page=args.per_page,
            max_pages=args.max_pages,
            skip_storage=args.skip_storage,
        )
    except Exception as exc:
        logger.exception("Court opinion sync failed: %s", exc)
        return 1
    stats.log("court-opinions")
    return 1 if stats.failed else 0


if __name__ == "__main__":
    sys.exit(main())
