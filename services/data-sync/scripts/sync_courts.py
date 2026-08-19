#!/usr/bin/env python3
"""Synchronize CourtListener courts."""

import argparse
import logging
import sys
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from sync_common import (
    RateLimiter,
    RunStats,
    build_http_session,
    create_supabase_client,
    iter_next_paginated_items,
    require_env,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

COURTS_URL = "https://www.courtlistener.com/api/rest/v4/courts/"
RATE_LIMITER = RateLimiter(1.0)


def fetch_all_courts(
    session: Any, *, per_page: int = 100, page_limit: Optional[int] = None
) -> List[Dict[str, Any]]:
    return list(
        iter_next_paginated_items(
            session,
            COURTS_URL,
            "results",
            params={"page_size": per_page},
            max_pages=page_limit,
            rate_limiter=RATE_LIMITER,
        )
    )


def map_court_to_row(court: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "remote_id": court.get("id"),
        "jurisdiction": court.get("jurisdiction"),
        "full_name": court.get("full_name"),
        "short_name": court.get("short_name"),
        "start_date": court.get("start_date"),
        "end_date": court.get("end_date"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--page-limit", type=int, default=20)
    parser.add_argument("--per-page", type=int, default=100)
    args = parser.parse_args()
    load_dotenv()
    try:
        session = build_http_session(
            headers={"Authorization": f"Token {require_env('COURT_LISTENER_API_KEY')}"}
        )
        courts = fetch_all_courts(
            session, per_page=args.per_page, page_limit=args.page_limit
        )
        supabase = create_supabase_client()
        rows = [map_court_to_row(court) for court in courts if court.get("id")]
        if rows:
            supabase.table("court").upsert(rows, on_conflict="remote_id").execute()
        stats = RunStats(
            fetched=len(courts), written=len(rows), skipped=len(courts) - len(rows)
        )
    except Exception as exc:
        logger.exception("Court sync failed: %s", exc)
        return 1
    stats.log("courts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
