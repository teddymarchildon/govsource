#!/usr/bin/env python3
"""Atomically refresh Congress.gov actions for bills stored in Supabase."""

from __future__ import annotations

import argparse
import logging
import sys
from typing import Any, Dict, List

from dotenv import load_dotenv
from sync_common import (
    RunStats,
    build_http_session,
    create_supabase_client,
    iter_paginated_items,
    require_env,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

BASE_URL = "https://api.congress.gov/v3"
MAX_API_LIMIT = 250


def fetch_bills_from_supabase(
    supabase: Any, limit: int = 20, offset: int = 0
) -> List[Dict[str, Any]]:
    result = (
        supabase.table("bill")
        .select("id, congress, type, number, bill_unique_id")
        .order("id")
        .range(offset, offset + limit - 1)
        .execute()
    )
    return result.data or []


def fetch_bill_actions(
    session: Any, congress: int, bill_type: str, bill_number: int
) -> List[Dict[str, Any]]:
    url = f"{BASE_URL}/bill/{congress}/{bill_type.lower()}/{bill_number}/actions"
    actions: List[Dict[str, Any]] = []
    for item in iter_paginated_items(
        session,
        url,
        "actions",
        params={"format": "json", "limit": MAX_API_LIMIT},
    ):
        date = item.get("actionDate")
        text = item.get("text")
        if not date or not text:
            logger.warning("Skipping incomplete action for %s", url)
            continue
        actions.append({"date": date, "text": text, "type": item.get("type") or ""})
    return actions


def overwrite_bill_actions_for_bill(
    supabase: Any, session: Any, bill: Dict[str, Any]
) -> int:
    actions = fetch_bill_actions(
        session,
        int(bill["congress"]),
        str(bill["type"]),
        int(bill["number"]),
    )
    supabase.rpc(
        "replace_bill_actions",
        {"p_bill_id": bill["id"], "p_actions": actions},
    ).execute()
    logger.info("Replaced %d actions for %s", len(actions), bill["bill_unique_id"])
    return len(actions)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--limit", type=int, default=20, help="Bills to process; -1 for all"
    )
    parser.add_argument("--offset", type=int, default=0)
    args = parser.parse_args()

    load_dotenv()
    try:
        api_key = require_env("CONGRESS_API_KEY")
        supabase = create_supabase_client()
    except Exception as exc:
        logger.error("Configuration error: %s", exc)
        return 2

    session = build_http_session(headers={"X-API-Key": api_key})
    stats = RunStats()
    offset = args.offset
    remaining = args.limit

    while remaining > 0 or args.limit == -1:
        page_size = MAX_API_LIMIT if args.limit == -1 else min(MAX_API_LIMIT, remaining)
        bills = fetch_bills_from_supabase(supabase, page_size, offset)
        fetched_count = len(bills)
        stats.fetched += fetched_count
        if not bills:
            break
        for bill in bills:
            try:
                overwrite_bill_actions_for_bill(supabase, session, bill)
                stats.written += 1
            except Exception as exc:
                stats.failed += 1
                logger.exception(
                    "Failed to refresh actions for %s: %s",
                    bill.get("bill_unique_id"),
                    exc,
                )
        offset += fetched_count
        if args.limit != -1:
            remaining -= fetched_count
        if fetched_count < page_size:
            break

    stats.log("bill-actions")
    return 1 if stats.failed else 0


if __name__ == "__main__":
    sys.exit(main())
