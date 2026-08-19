#!/usr/bin/env python3
"""Resolve agency parent IDs from their Federal Register remote parent IDs."""

import argparse
import logging
import sys

from dotenv import load_dotenv
from sync_common import create_supabase_client

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    load_dotenv()
    try:
        supabase = create_supabase_client()
        if args.dry_run:
            result = supabase.rpc("preview_agency_parent_reconciliation").execute()
            logger.info("Agency parent changes required: %s", result.data or 0)
        else:
            result = supabase.rpc("reconcile_agency_parents").execute()
            logger.info("Agency parent rows updated: %s", result.data or 0)
    except Exception as exc:
        logger.exception("Agency relationship update failed: %s", exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
