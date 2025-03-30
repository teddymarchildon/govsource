#!/usr/bin/env python3
"""
Script to sync bills from the Congress API to Supabase.
"""
import argparse
import json
import logging
import os
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional

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

# Congress API configuration
API_KEY = os.getenv("CONGRESS_API_KEY")
if not API_KEY:
    logger.error("CONGRESS_API_KEY environment variable is not set")
    sys.exit(1)

BASE_URL = "https://api.congress.gov/v3"
HEADERS = {"X-API-Key": API_KEY}

# Maximum limit allowed by the Congress API
MAX_API_LIMIT = 250


def fetch_bills(congress: int, limit: int = 20, offset: int = 0) -> Dict[str, Any]:
    """
    Fetch bills from the Congress API

    Args:
        congress: Congress number (e.g., 117 for 117th Congress)
        limit: Number of results to return
        offset: Offset for pagination

    Returns:
        Dictionary containing bill data
    """
    url = f"{BASE_URL}/bill/{congress}"
    params = {"limit": limit, "offset": offset, "format": "json"}

    try:
        response = requests.get(url, headers=HEADERS, params=params)
        response.raise_for_status()
        response_data = response.json()
        logger.info(f"Bills API Response structure: {list(response_data.keys())}")
        return response_data
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching bills: {e}")
        return {"bills": []}


def fetch_bill_detail(congress: int, bill_type: str, bill_number: int) -> Dict[str, Any]:
    """
    Fetch detailed information for a specific bill

    Args:
        congress: Congress number (e.g., 117 for 117th Congress)
        bill_type: Type of bill (e.g., 'hr', 's')
        bill_number: Bill number

    Returns:
        Dictionary containing detailed bill data
    """
    url = f"{BASE_URL}/bill/{congress}/{bill_type}/{bill_number}"
    params = {"format": "json"}

    try:
        response = requests.get(url, headers=HEADERS, params=params)
        response.raise_for_status()
        response_data = response.json()
        logger.info(f"Bill detail response structure: {list(response_data.keys())}")
        return response_data
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching bill detail: {e}")
        return {}


def fetch_bill_cosponsors(url: str) -> List[Dict[str, Any]]:
    """
    Fetch cosponsors for a bill using the provided URL from the bill data

    Args:
        url: URL to fetch cosponsors from

    Returns:
        List of cosponsor data dictionaries
    """
    try:
        # Remove the API base URL if it's included in the URL
        if url.startswith(BASE_URL):
            url = url
        else:
            # If it's a relative URL, add the base URL
            if not url.startswith("http"):
                url = f"{BASE_URL}{url if url.startswith('/') else '/' + url}"

        # Add format parameter if not already present
        if "format=" not in url:
            url = f"{url}{'&' if '?' in url else '?'}format=json"

        logger.info(f"Fetching cosponsors from URL: {url}")

        response = requests.get(url, headers=HEADERS)
        response.raise_for_status()
        response_data = response.json()

        # Log the structure of the response to debug
        logger.info(
            f"Cosponsor response keys: {list(response_data.keys()) if isinstance(response_data, dict) else 'Not a dictionary'}"
        )

        # Extract cosponsors from the response
        cosponsors = []

        # Check if response contains cosponsors
        if "cosponsors" in response_data and isinstance(response_data["cosponsors"], list):
            for item in response_data["cosponsors"]:
                cosponsor = {
                    "bioguide_id": item.get("bioguideId", ""),
                    "full_name": item.get("fullName", ""),
                    "first_name": item.get("firstName", ""),
                    "middle_name": item.get("middleName", ""),
                    "last_name": item.get("lastName", ""),
                    "party": item.get("party", ""),
                    "state": item.get("state", ""),
                    "district": str(item.get("district", "")),
                    "sponsorship_date": item.get("sponsorshipDate", ""),
                    "is_original_cosponsor": item.get("isOriginalCosponsor", False),
                }
                cosponsors.append(cosponsor)

        logger.info(f"Found {len(cosponsors)} cosponsors")
        return cosponsors
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching cosponsors: {e}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error fetching cosponsors: {e}", exc_info=True)
        return []


def fetch_bill_texts(url: str) -> List[Dict[str, Any]]:
    """
    Fetch text versions for a bill using the provided URL from the bill data

    Args:
        url: URL to fetch text versions from

    Returns:
        List of text version data dictionaries
    """
    try:
        # Remove the API base URL if it's included in the URL
        if url.startswith(BASE_URL):
            url = url
        else:
            # If it's a relative URL, add the base URL
            if not url.startswith("http"):
                url = f"{BASE_URL}{url if url.startswith('/') else '/' + url}"

        # Add format parameter if not already present
        if "format=" not in url:
            url = f"{url}{'&' if '?' in url else '?'}format=json"

        logger.info(f"Fetching bill texts from URL: {url}")

        response = requests.get(url, headers=HEADERS)
        response.raise_for_status()
        response_data = response.json()

        # Log the structure of the response to debug
        logger.info(
            f"Text response keys: {list(response_data.keys()) if isinstance(response_data, dict) else 'Not a dictionary'}"
        )

        # Extract text versions from the response
        text_versions = []

        # Check if response contains textVersions
        if "textVersions" in response_data:
            for item in response_data["textVersions"]:
                # Default values for URLs
                pdf_url = None
                xml_url = None
                formatted_text_url = None

                # Extract format URLs
                if "formats" in item:
                    for format_item in item["formats"]:
                        format_type = format_item.get("type", "")
                        format_url = format_item.get("url", "")

                        if "PDF" in format_type:
                            pdf_url = format_url
                        elif "XML" in format_type:
                            xml_url = format_url
                        elif "Formatted Text" in format_type:
                            formatted_text_url = format_url
                text_type = item.get("type")
                # Parse date
                date_str = item.get("date", "")
                date_obj = None
                if date_str:
                    try:
                        # Handle ISO format date
                        date_obj = datetime.fromisoformat(date_str.replace("Z", "+00:00")).date()
                    except ValueError:
                        logger.warning(f"Could not parse date: {date_str}")

                text_version = {
                    "type": text_type,
                    "date": date_obj.isoformat() if date_obj else None,
                    "pdf_url": pdf_url,
                    "xml_url": xml_url,
                    "formatted_text_url": formatted_text_url,
                }
                text_versions.append(text_version)

        logger.info(f"Found {len(text_versions)} text versions")
        return text_versions
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching bill texts: {e}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error fetching bill texts: {e}", exc_info=True)
        return []


def parse_bill_data(bill_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse bill data from the Congress API

    Args:
        bill_data: Bill data from the Congress API

    Returns:
        Parsed bill data
    """
    bill_info = bill_data.get("bill", {})

    # Extract basic bill information
    congress = bill_info.get("congress", 0)
    bill_type = bill_info.get("type", "")
    bill_number = bill_info.get("number", 0)
    title = bill_info.get("title", "")

    # Generate bill_id in the format "hr1234-117"
    bill_id = f"{bill_type.lower()}{bill_number}-{congress}"

    # Parse introduced date
    introduced_date = None
    if "introducedDate" in bill_info:
        try:
            introduced_date = datetime.strptime(bill_info["introducedDate"], "%Y-%m-%d").date()
        except ValueError:
            logger.warning(f"Could not parse introduced date: {bill_info['introducedDate']}")

    # Extract policy areas
    policy_areas = []
    if "policyArea" in bill_info and "name" in bill_info["policyArea"]:
        policy_areas.append(bill_info["policyArea"]["name"])

    # Extract sponsor information
    sponsors = []
    if "sponsors" in bill_info:
        for sponsor in bill_info["sponsors"]:
            sponsor = {
                "bioguide_id": sponsor.get("bioguideId", ""),
                "full_name": sponsor.get("fullName", ""),
                "first_name": sponsor.get("firstName", ""),
                "middle_name": sponsor.get("middleName", ""),
                "last_name": sponsor.get("lastName", ""),
                "party": sponsor.get("party", ""),
                "state": sponsor.get("state", ""),
                "district": str(sponsor.get("district", "")),
            }
            sponsors.append(sponsor)
            logger.info(f"Found sponsor: {sponsor['full_name']}")

    # Extract cosponsor information
    cosponsor_count = 0
    cosponsor_url = None
    if "cosponsors" in bill_info and isinstance(bill_info["cosponsors"], dict):
        if "count" in bill_info["cosponsors"]:
            cosponsor_count = bill_info["cosponsors"]["count"]
        if "url" in bill_info["cosponsors"]:
            cosponsor_url = bill_info["cosponsors"]["url"]

    # Extract text versions information
    text_versions_count = 0
    text_versions_url = None
    if "textVersions" in bill_info:
        if "count" in bill_info["textVersions"]:
            text_versions_count = bill_info["textVersions"]["count"]
        if "url" in bill_info["textVersions"]:
            text_versions_url = bill_info["textVersions"]["url"]

    return {
        "congress": congress,
        "type": bill_type,
        "number": bill_number,
        "bill_unique_id": bill_id,
        "title": title,
        "introduced_date": introduced_date.isoformat() if introduced_date else None,
        "policy_areas": policy_areas,
        "sponsors": sponsors,
        "cosponsor_count": cosponsor_count,
        "cosponsor_url": cosponsor_url,
        "text_versions_count": text_versions_count,
        "text_versions_url": text_versions_url,
    }


def sync_bills_to_supabase(
    supabase: Client, congress: int = 118, limit: int = 20, offset: int = 0
) -> List[Dict[str, Any]]:
    """
    Sync bills from the Congress API to Supabase

    Args:
        supabase: Supabase client
        congress: Congress number (e.g., 118 for 118th Congress)
        limit: Number of bills to fetch
        offset: Offset for pagination

    Returns:
        List of dictionaries representing bills that were created or updated
    """
    synced_bills = []

    try:
        # Fetch bills from the Congress API
        bill_list = fetch_bills(congress=congress, limit=limit, offset=offset)

        # Process each bill
        for bill_item in bill_list.get("bills", []):
            try:
                # Fetch detailed bill information
                bill_url = bill_item.get("url", "")
                if not bill_url:
                    logger.warning(f"No URL found for bill: {bill_item}")
                    continue

                bill_data = fetch_bill_detail(
                    congress, bill_item.get("type", ""), bill_item.get("number", 0)
                )
                if not bill_data:
                    logger.warning(f"No data found for bill at URL: {bill_url}")
                    continue

                # Parse bill data
                parsed_bill = parse_bill_data(bill_data)
                bill_unique_id = parsed_bill["bill_unique_id"]

                # Check if bill already exists in Supabase
                result = (
                    supabase.table("bill")
                    .select("id")
                    .eq("bill_unique_id", bill_unique_id)
                    .execute()
                )
                existing_bill = result.data[0] if result.data else None

                if existing_bill:
                    # Update existing bill
                    bill_db_id = existing_bill["id"]
                    logger.info(f"Updating bill: {bill_db_id}")

                    # Update bill data
                    bill_update_data = {
                        "title": parsed_bill["title"],
                        "introduced_date": parsed_bill["introduced_date"],
                        "policy_area": parsed_bill["policy_areas"][0]
                        if len(parsed_bill["policy_areas"]) > 0
                        else None,
                    }
                    supabase.table("bill").update(bill_update_data).eq("id", bill_db_id).execute()
                else:
                    # Create new bill
                    logger.info(f"Creating new bill: {bill_unique_id}")

                    # Prepare bill data for insertion
                    bill_insert_data = {
                        "congress": parsed_bill["congress"],
                        "bill_unique_id": parsed_bill["bill_unique_id"],
                        "type": parsed_bill["type"],
                        "number": parsed_bill["number"],
                        "title": parsed_bill["title"],
                        "introduced_date": parsed_bill["introduced_date"],
                        "policy_area": parsed_bill["policy_areas"][0]
                        if len(parsed_bill["policy_areas"]) > 0
                        else None,
                    }

                    # Insert bill
                    result = supabase.table("bill").insert(bill_insert_data).execute()
                    if not result.data:
                        logger.error(f"Failed to create bill: {bill_unique_id}")
                        continue

                    bill_db_id = result.data[0]["id"]

                # Clear existing sponsors and cosponsors
                # Delete from bill_sponsor table
                supabase.table("sponsored_bills").delete().eq("bill_id", bill_db_id).execute()

                # Delete from bill_cosponsor table
                supabase.table("cosponsored_bills").delete().eq("bill_id", bill_db_id).execute()

                # Add sponsors
                if "sponsors" in parsed_bill and parsed_bill["sponsors"]:
                    for sponsor_data in parsed_bill["sponsors"]:
                        bioguide_id = sponsor_data.get("bioguide_id")
                        if not bioguide_id:
                            logger.warning(f"No bioguide ID found for sponsor: {sponsor_data}")
                            continue

                        # Check if congressman exists
                        congressman_result = (
                            supabase.table("congressman")
                            .select("id")
                            .eq("bioguide_id", bioguide_id)
                            .execute()
                        )
                        congressman = (
                            congressman_result.data[0] if congressman_result.data else None
                        )

                        if not congressman:
                            # Fetch congressman details from Congress API
                            logger.info(f"Congressman {bioguide_id} not found, fetching from API")

                            # Create basic congressman record
                            congressman_data = {
                                "bioguide_id": bioguide_id,
                                "first_name": sponsor_data.get("first_name", ""),
                                "last_name": sponsor_data.get("last_name", ""),
                                "middle_name": sponsor_data.get("middle_name", ""),
                                "full_name": sponsor_data.get("full_name", ""),
                                "party": sponsor_data.get("party", ""),
                                "state": sponsor_data.get("state", ""),
                                "district": sponsor_data.get("district", ""),
                                "chamber": "house",  # Default value
                            }

                            # Insert congressman
                            congressman_result = (
                                supabase.table("congressman").insert(congressman_data).execute()
                            )
                            if not congressman_result.data:
                                logger.error(f"Failed to create congressman: {bioguide_id}")
                                continue

                            congressman_id = congressman_result.data[0]["id"]
                        else:
                            congressman_id = congressman["id"]

                        # Add sponsor relationship
                        sponsor_relation = {"bill_id": bill_db_id, "congressman_id": congressman_id}
                        supabase.table("sponsored_bills").insert(sponsor_relation).execute()

                # Fetch and add cosponsors if available
                if "cosponsor_url" in parsed_bill and parsed_bill["cosponsor_url"]:
                    cosponsors = fetch_bill_cosponsors(parsed_bill["cosponsor_url"])

                    for cosponsor_data in cosponsors:
                        bioguide_id = cosponsor_data.get("bioguide_id")
                        if not bioguide_id:
                            logger.warning(f"No bioguide ID found for cosponsor: {cosponsor_data}")
                            continue

                        # Check if congressman exists
                        congressman_result = (
                            supabase.table("congressman")
                            .select("id")
                            .eq("bioguide_id", bioguide_id)
                            .execute()
                        )
                        congressman = (
                            congressman_result.data[0] if congressman_result.data else None
                        )

                        if not congressman:
                            # Create basic congressman record
                            congressman_data = {
                                "bioguide_id": bioguide_id,
                                "first_name": cosponsor_data.get("first_name", ""),
                                "last_name": cosponsor_data.get("last_name", ""),
                                "middle_name": cosponsor_data.get("middle_name", ""),
                                "full_name": cosponsor_data.get("full_name", ""),
                                "party": cosponsor_data.get("party", ""),
                                "state": cosponsor_data.get("state", ""),
                                "district": cosponsor_data.get("district", ""),
                                "chamber": "house",  # Default value
                            }

                            # Insert congressman
                            congressman_result = (
                                supabase.table("congressman").insert(congressman_data).execute()
                            )
                            if not congressman_result.data:
                                logger.error(f"Failed to create congressman: {bioguide_id}")
                                continue

                            congressman_id = congressman_result.data[0]["id"]
                        else:
                            congressman_id = congressman["id"]

                        # Add cosponsor relationship
                        cosponsor_relation = {
                            "bill_id": bill_db_id,
                            "congressman_id": congressman_id,
                        }
                        supabase.table("cosponsored_bills").insert(cosponsor_relation).execute()

                # Fetch and add text versions if available
                if "text_versions_url" in parsed_bill and parsed_bill["text_versions_url"]:
                    text_versions = fetch_bill_texts(parsed_bill["text_versions_url"])

                    # Clear existing text versions
                    supabase.table("bill_text").delete().eq("bill_id", bill_db_id).execute()

                    for text_data in text_versions:
                        # Skip if date is None
                        if not text_data.get("date"):
                            logger.warning(
                                f"Skipping text version with no date for bill: {bill_db_id}"
                            )
                            continue

                        # Create text version record
                        bill_text_data = {
                            "bill_id": bill_db_id,
                            "date": text_data.get("date"),
                            "pdf_url": text_data.get("pdf_url"),
                            "xml_url": text_data.get("xml_url"),
                            "html_url": text_data.get("formatted_text_url"),
                        }

                        # Insert text version
                        supabase.table("bill_text").insert(bill_text_data).execute()
                        logger.info(
                            f"Added text version for date {text_data.get('date')} for bill: {bill_db_id}"
                        )

                # Add bill to synced list
                synced_bills.append(parsed_bill)

            except Exception as e:
                logger.error(f"Error processing bill: {e}", exc_info=True)
                continue

        return synced_bills
    except Exception as e:
        logger.error(f"Error syncing bills: {e}", exc_info=True)
        return []


def main():
    """Main function to run the bill sync process."""
    parser = argparse.ArgumentParser(description="Sync bills from the Congress API to Supabase")
    parser.add_argument("--congress", type=int, default=118, help="Congress number (default: 118)")
    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="Total number of bills to sync (default: 20, use -1 for all available)",
    )
    parser.add_argument(
        "--offset", type=int, default=0, help="Starting offset for pagination (default: 0)"
    )
    parser.add_argument(
        "--max-batches",
        type=int,
        default=100,
        help="Maximum number of batches to sync when using limit=-1 (default: 100)",
    )
    args = parser.parse_args()

    # Initialize Supabase client
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        sys.exit(1)

    try:
        total_bills = 0
        current_offset = args.offset

        # Calculate number of batches needed
        if args.limit == -1:
            # If limit is -1, sync all available bills up to max_batches
            remaining_limit = args.max_batches * MAX_API_LIMIT
            logger.info(f"Syncing all available bills up to {args.max_batches} batches")
        else:
            remaining_limit = args.limit
            logger.info(f"Syncing up to {remaining_limit} bills")

        batch_num = 1

        # Continue until we've synced all requested bills or reached the end of available data
        while remaining_limit > 0 or args.limit == -1:
            # Calculate the batch size (respecting the API's max limit)
            batch_size = min(MAX_API_LIMIT, remaining_limit) if args.limit != -1 else MAX_API_LIMIT

            logger.info(
                f"Starting batch {batch_num} with offset {current_offset}, batch size {batch_size}"
            )

            # Sync bills for this batch
            bills = sync_bills_to_supabase(
                supabase, congress=args.congress, limit=batch_size, offset=current_offset
            )
            batch_count = len(bills)
            total_bills += batch_count

            logger.info(f"Batch {batch_num} completed: synced {batch_count} bills")

            # If we received fewer bills than requested, we've reached the end
            if batch_count < batch_size:
                logger.info(f"Reached end of available bills at offset {current_offset}")
                break

            # Update offset for next batch
            current_offset += batch_count

            # Update remaining limit
            if args.limit != -1:
                remaining_limit -= batch_count

            # Check if we've reached the maximum number of batches
            if args.limit == -1 and batch_num >= args.max_batches:
                logger.info(f"Reached maximum number of batches ({args.max_batches})")
                break

            batch_num += 1

        logger.info(f"Successfully synced {total_bills} bills in total")
    except Exception as e:
        logger.error(f"Error syncing bills: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
