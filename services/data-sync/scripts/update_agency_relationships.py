#!/usr/bin/env python3
"""
Script to update parent-child relationships in the agency table in Supabase.
This script scans for agencies with a remote_parent_id and updates their parent_id
foreign key to reference the correct parent agency.
"""
import argparse
import logging
import os
import sys
from typing import Dict, List, Optional, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("SUPABASE_URL and SUPABASE_KEY environment variables must be set")
    sys.exit(1)


def fetch_all_agencies(supabase: Client) -> List[Dict]:
    """
    Fetch all agencies from Supabase database.

    Args:
        supabase: Supabase client

    Returns:
        List of agency dictionaries
    """
    logger.info("Fetching all agencies from Supabase")
    try:
        result = supabase.table("agency").select("*").execute()
        agencies = result.data
        logger.info(f"Successfully fetched {len(agencies)} agencies from database")
        return agencies
    except Exception as e:
        logger.error(f"Error fetching agencies from database: {e}")
        return []


def build_agency_lookup(agencies: List[Dict]) -> Tuple[Dict, Dict]:
    """
    Build lookup dictionaries for agencies by id and remote_agency_id.

    Args:
        agencies: List of agency dictionaries from Supabase

    Returns:
        Tuple of two dictionaries:
            1. Mapping remote_agency_id to agency
            2. Mapping agency id to agency
    """
    remote_id_map = {}
    id_map = {}

    for agency in agencies:
        if "remote_agency_id" in agency and agency["remote_agency_id"] is not None:
            remote_id_map[agency["remote_agency_id"]] = agency
        if "id" in agency:
            id_map[agency["id"]] = agency

    return remote_id_map, id_map


def update_agency_relationships(supabase: Client, dry_run: bool = False) -> int:
    """
    Update parent-child relationships for agencies in Supabase.

    Args:
        supabase: Supabase client
        dry_run: If True, don't actually update the database

    Returns:
        Number of agencies updated
    """
    logger.info("Starting agency relationship update")

    # Fetch all agencies from the database
    agencies = fetch_all_agencies(supabase)
    if not agencies:
        logger.warning("No agencies found in the database")
        return 0

    # Build lookup maps
    remote_id_map, id_map = build_agency_lookup(agencies)

    # Track updates
    updates_needed = []
    updated_count = 0

    # Process each agency
    for agency in agencies:
        try:
            # Skip agencies without a remote_parent_id
            if "remote_parent_id" not in agency or agency["remote_parent_id"] is None:
                continue

            # Get the current state
            current_parent_id = agency.get("parent_id")
            remote_parent_id = agency["remote_parent_id"]
            agency_name = agency.get("name", f"Agency {agency['id']}")

            # Find the parent agency by remote_parent_id
            if remote_parent_id in remote_id_map:
                parent_agency = remote_id_map[remote_parent_id]
                correct_parent_id = parent_agency["id"]

                # Check if update is needed
                if current_parent_id != correct_parent_id:
                    if dry_run:
                        logger.info(
                            f"Would update {agency_name} to set parent_id = {correct_parent_id} "
                            f"(parent: {parent_agency.get('name', 'Unknown')})"
                        )
                        updates_needed.append((agency["id"], correct_parent_id))
                    else:
                        try:
                            # Update the parent_id
                            result = supabase.table("agency").update(
                                {"parent_id": correct_parent_id}
                            ).eq("id", agency["id"]).execute()

                            if result.data and len(result.data) > 0:
                                logger.info(
                                    f"Updated {agency_name} to set parent_id = {correct_parent_id} "
                                    f"(parent: {parent_agency.get('name', 'Unknown')})"
                                )
                                updated_count += 1
                            else:
                                logger.warning(f"Failed to update {agency_name}, no rows affected")
                        except Exception as db_error:
                            logger.error(f"Database error updating {agency_name}: {db_error}")
                else:
                    logger.debug(f"No update needed for {agency_name}, parent_id already correct")
            else:
                logger.warning(
                    f"Parent agency with remote_id {remote_parent_id} not found for {agency_name}"
                )

        except Exception as e:
            logger.error(f"Error processing agency {agency.get('name', 'unknown')}: {e}")

    if dry_run:
        logger.info(f"Dry run complete. {len(updates_needed)} agencies would be updated")
        return len(updates_needed)
    else:
        logger.info(f"Update complete. {updated_count} agencies were updated")
        return updated_count


def main():
    """Main function to run the agency relationship update process."""
    parser = argparse.ArgumentParser(
        description="Update parent-child relationships in the agency table in Supabase"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run in dry run mode (simulate updates without modifying the database)"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose logging"
    )
    args = parser.parse_args()

    # Set logging level based on verbosity
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Initialize Supabase client
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        sys.exit(1)

    try:
        # Update agency relationships
        update_agency_relationships(supabase, dry_run=args.dry_run)
        logger.info("Agency relationship update process completed")
    except Exception as e:
        logger.error(f"Error updating agency relationships: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
