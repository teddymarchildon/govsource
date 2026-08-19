#!/usr/bin/env python3
"""Synchronize Federal Register agencies without clearing unavailable fields."""

from __future__ import annotations

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
    get_json,
    upsert_preserving_missing,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

BASE_URL = "https://www.federalregister.gov/api/v1"
RATE_LIMITER = RateLimiter(0.1)


def fetch_agencies_array(session: Any) -> List[Dict[str, Any]]:
    RATE_LIMITER.wait()
    response = session.get(f"{BASE_URL}/agencies.json", timeout=(10, 60))
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        raise ValueError("Federal Register agencies response was not a list")
    return [agency for agency in payload if isinstance(agency, dict)]


def fetch_agency_detail(session: Any, agency_id_or_slug: str) -> Dict[str, Any]:
    return get_json(
        session,
        f"{BASE_URL}/agencies/{agency_id_or_slug}.json",
        rate_limiter=RATE_LIMITER,
    )


def transform_agency(
    agency: Dict[str, Any], agency_detail: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    row = {
        "remote_agency_id": agency["id"],
        "url": agency["url"],
        "name": agency["name"],
        "short_name": agency.get("short_name", ""),
        "remote_parent_id": agency.get("parent_id"),
        "slug": agency.get("slug", ""),
    }
    if agency_detail is not None:
        row["description"] = agency_detail.get("description", "")
    return row


def sync_agencies_to_supabase(
    supabase: Any,
    session: Any,
    *,
    fetch_details: bool = True,
    max_agencies: Optional[int] = None,
) -> RunStats:
    agencies = fetch_agencies_array(session)
    if max_agencies is not None:
        agencies = agencies[:max_agencies]
    stats = RunStats(fetched=len(agencies))

    for agency in agencies:
        try:
            if "id" not in agency:
                stats.skipped += 1
                continue
            detail = (
                fetch_agency_detail(session, str(agency["id"]))
                if fetch_details
                else None
            )
            row = transform_agency(agency, detail)
            upsert_preserving_missing(supabase, "agency", row, "remote_agency_id")
            stats.written += 1
        except Exception as exc:
            stats.failed += 1
            logger.exception("Failed to sync agency %s: %s", agency.get("name"), exc)

    # Resolve parent IDs only after all parent agencies have been upserted.
    if not stats.failed:
        supabase.rpc("reconcile_agency_parents").execute()
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--skip-details", action="store_true")
    parser.add_argument("--max-agencies", type=int)
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    load_dotenv()
    try:
        session = build_http_session()
        if args.dry_run:
            agencies = fetch_agencies_array(session)
            logger.info(
                "Dry run: fetched %d agencies; no writes performed", len(agencies)
            )
            return 0
        supabase = create_supabase_client()
        stats = sync_agencies_to_supabase(
            supabase,
            session,
            fetch_details=not args.skip_details,
            max_agencies=args.max_agencies,
        )
    except Exception as exc:
        logger.exception("Agency sync failed: %s", exc)
        return 1

    stats.log("agencies")
    return 1 if stats.failed else 0


if __name__ == "__main__":
    sys.exit(main())
