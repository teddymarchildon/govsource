#!/usr/bin/env python3
"""
Script to sync federal agencies from the Federal Register API to Supabase.
"""
import argparse
import logging
import os
import sys
import time
from typing import List, Dict, Optional

import requests
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

# Federal Register API base URL
FEDERAL_REGISTER_BASE_URL = "https://www.federalregister.gov/api/v1"

# Rate limiting parameters
API_REQUESTS_PER_SECOND = 10  # Limit to 10 requests per second to be safe
REQUEST_DELAY = 1.0 / API_REQUESTS_PER_SECOND

def fetch_agencies() -> List[Dict]:
    """
    Fetch all agencies from the Federal Register API.

    Returns:
        List of agency dictionaries
    """
    logger.info("Fetching agencies from Federal Register API")
    try:
        response = requests.get(f"{FEDERAL_REGISTER_BASE_URL}/agencies.json")
        response.raise_for_status()
        agencies = response.json()
        logger.info(f"Successfully fetched {len(agencies)} agencies")
        return agencies
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching agencies from Federal Register API: {e}")
        return []

def fetch_agency_detail(agency_id_or_slug: str) -> Dict:
    """
    Fetch detailed information for a specific agency from the Federal Register API.

    Args:
        agency_id_or_slug: Agency ID or slug

    Returns:
        Agency detail dictionary
    """
    try:
        # Add a small delay to avoid rate limiting
        time.sleep(REQUEST_DELAY)

        url = f"{FEDERAL_REGISTER_BASE_URL}/agencies/{agency_id_or_slug}.json"
        logger.debug(f"Fetching agency detail from: {url}")

        response = requests.get(url)
        response.raise_for_status()
        agency_detail = response.json()
        return agency_detail
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching agency detail for {agency_id_or_slug}: {e}")
        return {}

def get_parent_agency_id(remote_parent_id: Optional[int], supabase: Client) -> Optional[str]:
    """
    Look up parent agency ID in Supabase using remote_parent_id.

    Args:
        remote_parent_id: The remote ID of the parent agency
        supabase: Supabase client

    Returns:
        UUID of the parent agency in Supabase, or None if not found
    """
    if not remote_parent_id:
        return None

    try:
        result = supabase.table("agency").select("id").eq("remote_agency_id", remote_parent_id).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]["id"]
        else:
            logger.debug(f"Parent agency with remote_id {remote_parent_id} not found in database")
            return None
    except Exception as e:
        logger.error(f"Error looking up parent agency ID for remote_id {remote_parent_id}: {e}")
        return None

def transform_agency(agency: Dict, agency_detail: Dict, supabase: Client) -> Dict:
    """
    Transform Federal Register agency data to match our schema.

    Args:
        agency: Basic agency data from Federal Register API
        agency_detail: Detailed agency data from Federal Register API
        supabase: Supabase client

    Returns:
        Transformed agency data
    """
    # Get the description from the agency_detail if available
    description = agency_detail.get("description", "")

    parent_id = get_parent_agency_id(agency.get("parent_id"), supabase)

    return {
        "remote_agency_id": agency["id"],
        "url": agency["url"],
        "name": agency["name"],
        "short_name": agency.get("short_name", ""),
        "remote_parent_id": agency.get("parent_id"),
        "parent_id": parent_id,
        "description": description,
        "slug": agency.get("slug", "")
    }

def sync_agencies_to_supabase(supabase: Client, fetch_details: bool = True, max_agencies: int = None) -> List[Dict]:
    """
    Sync agencies from the Federal Register API to Supabase

    Args:
        supabase: Supabase client
        fetch_details: Whether to fetch detailed agency information
        max_agencies: Maximum number of agencies to process (for testing/debugging)

    Returns:
        List of dictionaries representing agencies that were created or updated
    """
    logger.info(f"Starting agency sync (fetch_details={fetch_details})")

    # Fetch agencies from Federal Register
    agencies = fetch_agencies()
    if not agencies:
        logger.warning("No agencies found in the API response")
        return []

    # Limit the number of agencies if specified
    if max_agencies is not None:
        agencies = agencies[:max_agencies]
        logger.info(f"Limited to processing {max_agencies} agencies")

    # Transform and upsert each agency
    synced_agencies = []
    for i, agency in enumerate(agencies):
        try:
            # Skip agencies without an ID
            if "id" not in agency:
                logger.warning("Agency missing ID, skipping")
                continue

            agency_id = agency["id"]
            agency_name = agency.get("name", f"Agency {agency_id}")

            # Fetch detailed agency information if requested
            agency_detail = {}
            if fetch_details:
                logger.info(f"Fetching details for agency {agency_name} ({i+1}/{len(agencies)})")
                agency_detail = fetch_agency_detail(str(agency_id))
                if not agency_detail:
                    logger.warning(f"Could not fetch details for agency {agency_name}")

            # Transform agency data to match our schema
            transformed_agency = transform_agency(agency, agency_detail, supabase)

            # Upsert the agency into Supabase
            try:
                result = supabase.table("agency").upsert(
                    transformed_agency,
                    on_conflict="remote_agency_id"
                ).execute()

                # Check if there was an error in the data
                if hasattr(result, 'error') and result.error:
                    logger.error(f"Error upserting agency {agency_name}: {result.error}")
                    continue
                elif not result.data:
                    logger.warning(f"No data returned when upserting agency {agency_name}")
                    continue

                logger.info(f"Successfully synced agency: {agency_name}")
                synced_agencies.append(transformed_agency)
            except Exception as db_error:
                logger.error(f"Database error while upserting agency {agency_name}: {db_error}")
                continue

        except Exception as e:
            logger.error(f"Error processing agency {agency.get('name', 'unknown')}: {e}")

    logger.info(f"Successfully synced {len(synced_agencies)} agencies")
    return synced_agencies

def main():
    """Main function to run the agency sync process."""
    parser = argparse.ArgumentParser(description="Sync federal agencies from the Federal Register API to Supabase")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run in dry run mode (fetch data but don't write to Supabase)"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose logging"
    )
    parser.add_argument(
        "--skip-details",
        action="store_true",
        help="Skip fetching detailed agency information"
    )
    parser.add_argument(
        "--max-agencies",
        type=int,
        help="Maximum number of agencies to process (for testing/debugging)"
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
        if args.dry_run:
            logger.info("Running in dry run mode - no data will be written to Supabase")
            agencies = fetch_agencies()
            if not agencies:
                logger.warning("No agencies found in API response")
                sys.exit(0)

            logger.info(f"Would sync {len(agencies)} agencies")

            # Display first few agencies as example
            for i, agency in enumerate(agencies[:3]):
                if args.skip_details:
                    transformed = transform_agency(agency, {}, supabase)
                    logger.info(f"Example transformation: {agency['name']} -> {transformed}")
                else:
                    agency_detail = fetch_agency_detail(str(agency["id"]))
                    transformed = transform_agency(agency, agency_detail, supabase)
                    logger.info(f"Example transformation with details: {agency['name']} -> {transformed}")
        else:
            # Sync agencies to Supabase
            sync_agencies_to_supabase(
                supabase,
                fetch_details=not args.skip_details,
                max_agencies=args.max_agencies
            )

        logger.info("Agency sync process completed")
    except Exception as e:
        logger.error(f"Error syncing agencies: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
