#!/usr/bin/env python3
"""Synchronize Congress.gov bills and their complete child collections."""

from __future__ import annotations

import argparse
import hashlib
import logging
import re
import sys
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

import html2text
from dotenv import load_dotenv
from sync_common import (
    DEFAULT_TIMEOUT,
    RunStats,
    UpstreamAPIError,
    build_http_session,
    create_supabase_client,
    get_json,
    iter_paginated_items,
    require_env,
    upload_bytes,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

BASE_URL = "https://api.congress.gov/v3"
MAX_API_LIMIT = 250


class CongressClient:
    def __init__(self, api_key: str) -> None:
        self.session = build_http_session(headers={"X-API-Key": api_key})

    def bill_references(
        self,
        congress: int,
        *,
        limit: Optional[int],
        offset: int,
        max_pages: Optional[int],
    ) -> List[Dict[str, Any]]:
        url = f"{BASE_URL}/bill/{congress}"
        references: List[Dict[str, Any]] = []
        for item in iter_paginated_items(
            self.session,
            url,
            "bills",
            params={
                "sort": "updateDate+desc",
                "limit": MAX_API_LIMIT if limit is None else min(MAX_API_LIMIT, limit),
                "offset": offset,
                "format": "json",
            },
            max_pages=max_pages,
        ):
            references.append(item)
            if limit is not None and len(references) >= limit:
                break
        return references

    def bill_detail(self, url: str) -> Dict[str, Any]:
        return get_json(self.session, url, params={"format": "json"})

    def collection(self, url: str, key: str) -> List[Dict[str, Any]]:
        return list(
            iter_paginated_items(
                self.session,
                url,
                key,
                params={"format": "json", "limit": MAX_API_LIMIT},
            )
        )

    def actions(
        self, congress: int, bill_type: str, number: int
    ) -> List[Dict[str, Any]]:
        url = f"{BASE_URL}/bill/{congress}/{bill_type.lower()}/{number}/actions"
        actions = []
        for item in self.collection(url, "actions"):
            if item.get("actionDate") and item.get("text"):
                actions.append(
                    {
                        "date": item["actionDate"],
                        "text": item["text"],
                        "type": item.get("type") or "",
                    }
                )
        return actions

    def download(self, url: str) -> tuple[bytes, str]:
        try:
            response = self.session.get(url, timeout=DEFAULT_TIMEOUT)
            response.raise_for_status()
        except Exception as exc:
            raise UpstreamAPIError(f"Failed to download {url}: {exc}") from exc
        return response.content, response.headers.get(
            "content-type", "application/octet-stream"
        )


def _parse_date(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date().isoformat()
    except ValueError:
        logger.warning("Invalid date from Congress.gov: %s", value)
        return None


def parse_bill_data(payload: Dict[str, Any]) -> Dict[str, Any]:
    bill = payload.get("bill")
    if not isinstance(bill, dict):
        raise UpstreamAPIError("Bill detail response did not contain a bill object")

    congress = int(bill["congress"])
    bill_type = str(bill["type"])
    number = int(bill["number"])
    law = bill.get("laws", [{}])[0] if bill.get("laws") else {}
    law_number = law.get("number")
    if law_number and "-" in str(law_number):
        law_number = str(law_number).split("-")[-1]
    law_type = law.get("type")

    law_date = None
    latest_action = bill.get("latestAction") or {}
    if law_type and latest_action.get("actionDate"):
        law_date = _parse_date(latest_action["actionDate"])

    return {
        "congress": congress,
        "type": bill_type,
        "number": number,
        "bill_unique_id": f"{bill_type.lower()}{number}-{congress}",
        "title": bill.get("title") or "",
        "introduced_date": _parse_date(bill.get("introducedDate")),
        "policy_area": (bill.get("policyArea") or {}).get("name"),
        "law_enacted_date": law_date,
        "law_number": law_number,
        "law_type": law_type,
        "law_unique_id": (
            f"{str(law_type).lower()}-{law_number}-{congress}"
            if law_type and law_number
            else None
        ),
        "law_title": bill.get("title") if law_type else None,
        "sponsors": bill.get("sponsors") or [],
        "cosponsors_url": (bill.get("cosponsors") or {}).get("url"),
        "texts_url": (bill.get("textVersions") or {}).get("url"),
        "summaries_url": (bill.get("summaries") or {}).get("url"),
    }


def _person_row(person: Dict[str, Any]) -> Dict[str, Any]:
    bioguide_id = person.get("bioguideId") or person.get("bioguide_id")
    if not bioguide_id:
        raise UpstreamAPIError("Sponsor or cosponsor is missing bioguideId")
    return {
        "bioguide_id": bioguide_id,
        "first_name": person.get("firstName") or person.get("first_name") or "",
        "middle_name": person.get("middleName") or person.get("middle_name") or "",
        "last_name": person.get("lastName") or person.get("last_name") or "",
        "full_name": person.get("fullName") or person.get("full_name") or "",
        "party": person.get("party") or "",
        "state": person.get("state") or "",
        "district": "" if person.get("district") is None else str(person["district"]),
        "chamber": "senate" if person.get("district") is None else "house",
    }


def ensure_congressmen(supabase: Any, people: Iterable[Dict[str, Any]]) -> List[str]:
    ids: List[str] = []
    for person in people:
        row = _person_row(person)
        existing = (
            supabase.table("congressman")
            .select("id")
            .eq("bioguide_id", row["bioguide_id"])
            .execute()
        )
        if existing.data:
            ids.append(existing.data[0]["id"])
            continue
        created = (
            supabase.table("congressman")
            .upsert(row, on_conflict="bioguide_id")
            .execute()
        )
        if not created.data:
            raise RuntimeError(f"Could not create congressman {row['bioguide_id']}")
        ids.append(created.data[0]["id"])
    return ids


def _text_fallback_key(item: Dict[str, Any]) -> str:
    identity = "|".join(
        [
            str(item.get("type") or ""),
            str(item.get("pdf_url") or ""),
            str(item.get("html_url") or ""),
            str(item.get("xml_url") or ""),
        ]
    )
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]


def parse_text_versions(items: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    parsed: List[Dict[str, Any]] = []
    for item in items:
        urls: Dict[str, Optional[str]] = {
            "pdf_url": None,
            "html_url": None,
            "xml_url": None,
        }
        for file_format in item.get("formats") or []:
            format_type = file_format.get("type")
            if format_type == "PDF":
                urls["pdf_url"] = file_format.get("url")
            elif format_type in {"HTML", "Formatted Text"}:
                urls["html_url"] = file_format.get("url")
            elif format_type in {"XML", "Formatted XML"}:
                urls["xml_url"] = file_format.get("url")
        if not any(urls.values()):
            continue
        row: Dict[str, Any] = {
            "date": item.get("date"),
            "type": item.get("type"),
            **urls,
        }
        row["fallback_key"] = None if row["date"] else _text_fallback_key(row)
        parsed.append(row)
    return parsed


def upload_bill_texts(
    supabase: Any,
    client: CongressClient,
    bill: Dict[str, Any],
    texts: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    bill_path = f"{bill['congress']}_{bill['type']}_{bill['number']}"
    for text in texts:
        version = re.sub(
            r"[^A-Za-z0-9_.-]", "_", str(text.get("date") or text["fallback_key"])
        )
        for source_key, path_key, bucket, filename in (
            ("pdf_url", "pdf_file_path", "bill-pdfs", "bill.pdf"),
            ("html_url", "html_file_path", "bill-htmls", "bill.html"),
            ("xml_url", "xml_file_path", "bill-xmls", "bill.xml"),
        ):
            source_url = text.get(source_key)
            if not source_url:
                text[path_key] = None
                continue
            content, content_type = client.download(source_url)
            text[path_key] = upload_bytes(
                supabase,
                bucket,
                f"{bill_path}/{version}/{filename}",
                content,
                content_type,
            )
    return texts


def sync_bill(supabase: Any, client: CongressClient, detail_url: str) -> Dict[str, Any]:
    bill = parse_bill_data(client.bill_detail(detail_url))
    db_row = {
        k: bill[k]
        for k in (
            "congress",
            "type",
            "number",
            "bill_unique_id",
            "title",
            "introduced_date",
            "policy_area",
            "law_enacted_date",
            "law_number",
            "law_type",
            "law_unique_id",
            "law_title",
        )
    }
    result = (
        supabase.table("bill").upsert(db_row, on_conflict="bill_unique_id").execute()
    )
    if not result.data:
        raise RuntimeError(f"Bill upsert returned no ID for {bill['bill_unique_id']}")
    bill_id = result.data[0]["id"]

    sponsors = bill["sponsors"]
    cosponsors = (
        client.collection(bill["cosponsors_url"], "cosponsors")
        if bill["cosponsors_url"]
        else []
    )
    sponsor_ids = ensure_congressmen(supabase, sponsors)
    cosponsor_ids = ensure_congressmen(supabase, cosponsors)

    texts = (
        parse_text_versions(client.collection(bill["texts_url"], "textVersions"))
        if bill["texts_url"]
        else []
    )
    texts = upload_bill_texts(supabase, client, bill, texts)
    actions = client.actions(bill["congress"], bill["type"], bill["number"])

    summaries = []
    if bill["summaries_url"]:
        for item in client.collection(bill["summaries_url"], "summaries"):
            if item.get("actionDate") and item.get("text"):
                summaries.append(
                    {
                        "date": item["actionDate"],
                        "text": html2text.html2text(item["text"]).strip(),
                    }
                )

    supabase.rpc(
        "replace_bill_children",
        {
            "p_bill_id": bill_id,
            "p_sponsor_ids": sponsor_ids,
            "p_cosponsor_ids": cosponsor_ids,
            "p_texts": texts,
            "p_actions": actions,
            "p_summaries": summaries,
        },
    ).execute()
    logger.info("Synchronized %s", bill["bill_unique_id"])
    return bill


def sync_single_bill_by_id(supabase: Any, client: CongressClient, bill_id: str) -> bool:
    result = (
        supabase.table("bill")
        .select("congress,type,number,bill_unique_id")
        .eq("id", bill_id)
        .execute()
    )
    if not result.data:
        logger.error("Bill %s was not found", bill_id)
        return False
    bill = result.data[0]
    detail_url = f"{BASE_URL}/bill/{bill['congress']}/{str(bill['type']).lower()}/{bill['number']}"
    sync_bill(supabase, client, detail_url)
    return True


def parse_bill_reference(value: str) -> tuple[str, int]:
    match = re.fullmatch(r"([A-Za-z]+)[- ]?(\d+)", value.strip())
    if not match:
        raise argparse.ArgumentTypeError(
            "Bill references must look like HR6644, HR-6644, or S98"
        )
    return match.group(1).upper(), int(match.group(2))


def sync_bill_by_reference(
    supabase: Any,
    client: CongressClient,
    congress: int,
    bill_type: str,
    number: int,
) -> Dict[str, Any]:
    detail_url = f"{BASE_URL}/bill/{congress}/{bill_type.lower()}/{number}"
    return sync_bill(supabase, client, detail_url)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--congress", type=int, default=119)
    parser.add_argument(
        "--limit", type=int, default=20, help="Bills to sync; -1 for all"
    )
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--max-batches", type=int, default=100)
    parser.add_argument("--bill-id")
    parser.add_argument(
        "--bill",
        action="append",
        type=parse_bill_reference,
        default=[],
        metavar="TYPE-NUMBER",
        help="Sync an exact bill such as HR-6644; may be repeated",
    )
    args = parser.parse_args()

    if args.bill_id and args.bill:
        parser.error("--bill-id and --bill cannot be used together")

    load_dotenv()
    try:
        client = CongressClient(require_env("CONGRESS_API_KEY"))
        supabase = create_supabase_client()
    except Exception as exc:
        logger.error("Configuration error: %s", exc)
        return 2

    stats = RunStats()
    if args.bill_id:
        try:
            return 0 if sync_single_bill_by_id(supabase, client, args.bill_id) else 1
        except Exception as exc:
            logger.exception("Single-bill sync failed: %s", exc)
            return 1

    if args.bill:
        stats.fetched = len(args.bill)
        for bill_type, number in args.bill:
            try:
                sync_bill_by_reference(
                    supabase, client, args.congress, bill_type, number
                )
                stats.written += 1
            except Exception as exc:
                stats.failed += 1
                logger.exception(
                    "Failed to sync %s-%s in Congress %s: %s",
                    bill_type,
                    number,
                    args.congress,
                    exc,
                )
        stats.log("bills-targeted")
        return 1 if stats.failed else 0

    requested_limit = None if args.limit == -1 else max(0, args.limit)
    max_pages = args.max_batches if args.limit == -1 else None
    try:
        references = client.bill_references(
            args.congress,
            limit=requested_limit,
            offset=args.offset,
            max_pages=max_pages,
        )
    except Exception as exc:
        logger.error("Could not list bills: %s", exc)
        return 1

    stats.fetched = len(references)
    for reference in references:
        detail_url = reference.get("url")
        if not detail_url:
            stats.failed += 1
            logger.error("Bill reference is missing its detail URL: %s", reference)
            continue
        try:
            sync_bill(supabase, client, detail_url)
            stats.written += 1
        except Exception as exc:
            stats.failed += 1
            logger.exception("Failed to sync %s: %s", detail_url, exc)

    stats.log("bills")
    return 1 if stats.failed else 0


if __name__ == "__main__":
    sys.exit(main())
