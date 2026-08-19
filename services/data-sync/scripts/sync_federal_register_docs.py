#!/usr/bin/env python3
"""Synchronize Federal Register documents and storage objects safely."""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from sync_common import (
    DEFAULT_TIMEOUT,
    RateLimiter,
    RunStats,
    UpstreamAPIError,
    build_http_session,
    create_supabase_client,
    get_json,
    upload_bytes,
    upsert_preserving_missing,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

BASE_URL = "https://www.federalregister.gov/api/v1"
REQUESTS_PER_HOUR = 1000
RATE_LIMITER = RateLimiter(3600 / REQUESTS_PER_HOUR)

PRESIDENTIAL_TERMS: List[Dict[str, Any]] = [
    {"name": "Donald Trump", "start": date(2025, 1, 20), "end": date(2029, 1, 20)},
    {"name": "Joe Biden", "start": date(2021, 1, 20), "end": date(2025, 1, 20)},
    {"name": "Donald Trump", "start": date(2017, 1, 20), "end": date(2021, 1, 20)},
    {"name": "Barack Obama", "start": date(2009, 1, 20), "end": date(2017, 1, 20)},
    {"name": "George W. Bush", "start": date(2001, 1, 20), "end": date(2009, 1, 20)},
    {"name": "Bill Clinton", "start": date(1993, 1, 20), "end": date(2001, 1, 20)},
]


def get_president_by_date(signing_date: Optional[str]) -> Optional[str]:
    if not signing_date:
        return None
    try:
        signed = datetime.strptime(signing_date, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        logger.warning("Invalid signing date: %s", signing_date)
        return None
    return next(
        (
            term["name"]
            for term in PRESIDENTIAL_TERMS
            if term["start"] <= signed < term["end"]
        ),
        None,
    )


class FederalRegisterClient:
    def __init__(self) -> None:
        self.session = build_http_session()

    def documents(
        self,
        *,
        agency_id: Optional[str],
        document_type: Optional[str],
        page_size: int,
        max_pages: Optional[int],
        start_page: int,
    ) -> List[Dict[str, Any]]:
        documents: List[Dict[str, Any]] = []
        page = start_page
        processed = 0
        while max_pages is None or processed < max_pages:
            params = {
                "conditions[agencies][]": agency_id,
                "conditions[type][]": document_type,
                "per_page": page_size,
                "page": page,
                "order": "newest",
            }
            payload = get_json(
                self.session,
                f"{BASE_URL}/documents.json",
                params={
                    key: value for key, value in params.items() if value is not None
                },
                rate_limiter=RATE_LIMITER,
            )
            results = payload.get("results") or []
            if not isinstance(results, list):
                raise UpstreamAPIError("Federal Register results was not a list")
            documents.extend(item for item in results if isinstance(item, dict))
            processed += 1
            total_pages = int(payload.get("total_pages") or page)
            if page >= total_pages:
                break
            page += 1
        return documents

    def detail(self, document_number: str) -> Dict[str, Any]:
        return get_json(
            self.session,
            f"{BASE_URL}/documents/{document_number}.json",
            rate_limiter=RATE_LIMITER,
        )

    def download(self, url: str) -> tuple[bytes, str]:
        RATE_LIMITER.wait()
        try:
            response = self.session.get(url, timeout=DEFAULT_TIMEOUT)
            response.raise_for_status()
        except Exception as exc:
            raise UpstreamAPIError(f"Failed to download {url}: {exc}") from exc
        return response.content, response.headers.get(
            "content-type", "application/octet-stream"
        )


def upload_document_files(
    supabase: Any, client: FederalRegisterClient, detail: Dict[str, Any]
) -> Dict[str, str]:
    number = detail["document_number"]
    paths: Dict[str, str] = {}
    for source_key, path_key, folder, extension, default_type in (
        ("pdf_url", "pdf_file_path", "pdfs", "pdf", "application/pdf"),
        ("body_html_url", "html_file_path", "html", "html", "text/html"),
        ("full_text_xml_url", "xml_file_path", "xml", "xml", "application/xml"),
    ):
        url = detail.get(source_key)
        if not url:
            continue
        content, content_type = client.download(url)
        path = f"{folder}/{number}.{extension}"
        paths[path_key] = upload_bytes(
            supabase,
            "agency-docs",
            path,
            content,
            content_type or default_type,
        )
    return paths


def agency_ids_for_document(supabase: Any, detail: Dict[str, Any]) -> List[str]:
    ids: List[str] = []
    for agency in detail.get("agencies") or []:
        remote_id = agency.get("id")
        if remote_id is None:
            continue
        result = (
            supabase.table("agency")
            .select("id")
            .eq("remote_agency_id", remote_id)
            .execute()
        )
        if result.data:
            ids.append(result.data[0]["id"])
        else:
            logger.warning("Agency %s is not present locally", remote_id)
    return ids


def document_row(detail: Dict[str, Any]) -> Dict[str, Any]:
    row = {
        "title": detail.get("title"),
        "type": detail.get("type"),
        "subtype": detail.get("subtype") or "",
        "publication_date": detail.get("publication_date"),
        "signing_date": detail.get("signing_date"),
        "pdf_url": detail.get("pdf_url"),
        "html_url": detail.get("body_html_url"),
        "xml_url": detail.get("full_text_xml_url"),
        "abstract": detail.get("abstract") or "",
        "remote_document_number": detail.get("document_number"),
    }
    if row["type"] == "Presidential Document":
        president = get_president_by_date(row["signing_date"])
        if president:
            row["president"] = president
    return row


def sync_documents_to_supabase(
    supabase: Any,
    client: FederalRegisterClient,
    *,
    agency_id: Optional[str] = None,
    document_type: Optional[str] = None,
    per_page: int = 100,
    max_pages: Optional[int] = None,
    skip_storage: bool = False,
    start_page: int = 1,
) -> RunStats:
    documents = client.documents(
        agency_id=agency_id,
        document_type=document_type,
        page_size=per_page,
        max_pages=max_pages,
        start_page=start_page,
    )
    stats = RunStats(fetched=len(documents))
    for document in documents:
        try:
            number = document.get("document_number")
            if not number:
                raise UpstreamAPIError("Document is missing document_number")
            detail = client.detail(number)
            row = document_row(detail)
            if not row["remote_document_number"]:
                raise UpstreamAPIError(
                    f"Detail response for {number} is missing its number"
                )
            if not skip_storage:
                row.update(upload_document_files(supabase, client, detail))
            result = upsert_preserving_missing(
                supabase,
                "agency_document",
                row,
                "remote_document_number",
            )
            if not result.data:
                raise RuntimeError(f"Document upsert returned no ID for {number}")
            supabase.rpc(
                "replace_agency_document_relationships",
                {
                    "p_agency_document_id": result.data[0]["id"],
                    "p_agency_ids": agency_ids_for_document(supabase, detail),
                },
            ).execute()
            stats.written += 1
        except Exception as exc:
            stats.failed += 1
            logger.exception(
                "Failed to sync document %s: %s", document.get("document_number"), exc
            )
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agency-id")
    parser.add_argument(
        "--document-type",
        choices=["RULE", "PRORULE", "NOTICE", "PRESDOCU"],
        default="PRESDOCU",
    )
    parser.add_argument("--per-page", type=int, default=100)
    parser.add_argument("--max-pages", type=int, default=50)
    parser.add_argument("--start-page", type=int, default=1)
    parser.add_argument("--skip-storage", action="store_true")
    args = parser.parse_args()

    load_dotenv()
    try:
        stats = sync_documents_to_supabase(
            create_supabase_client(),
            FederalRegisterClient(),
            agency_id=args.agency_id,
            document_type=args.document_type,
            per_page=args.per_page,
            max_pages=args.max_pages,
            skip_storage=args.skip_storage,
            start_page=args.start_page,
        )
    except Exception as exc:
        logger.exception("Federal Register sync failed: %s", exc)
        return 1
    stats.log("federal-register-documents")
    return 1 if stats.failed else 0


if __name__ == "__main__":
    sys.exit(main())
