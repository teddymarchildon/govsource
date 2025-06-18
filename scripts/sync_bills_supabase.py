#!/usr/bin/env python3
"""
Script to sync bills from the Congress API to Supabase.
"""
import argparse
import json
import logging
import os
import sys
import tempfile
from datetime import datetime
from typing import Any, Dict, List, Optional
from pathlib import Path

import requests
from dotenv import load_dotenv
from supabase import Client, create_client
import html2text

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
    url = f"{BASE_URL}/bill?sort=updateDate+desc"
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


def fetch_bill_detail(url: str) -> Dict[str, Any]:
    """
    Fetch detailed information for a specific bill

    Args:
        congress: Congress number (e.g., 117 for 117th Congress)
        bill_type: Type of bill (e.g., 'hr', 's')
        bill_number: Bill number

    Returns:
        Dictionary containing detailed bill data
    """
    try:
        response = requests.get(url, headers=HEADERS)
        response.raise_for_status()
        response_data = response.json()
        return response_data
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching bill detail: {e}")
        return {}


def fetch_bill_actions(congress: int, bill_type: str, bill_number: int) -> List[Dict[str, Any]]:
    """
    Fetch actions for a specific bill from the Congress API

    Args:
        congress: Congress number (e.g., 117 for 117th Congress)
        bill_type: Type of bill (e.g., 'hr', 's')
        bill_number: Bill number

    Returns:
        List of action data dictionaries
    """
    url = f"{BASE_URL}/bill/{congress}/{bill_type.lower()}/{bill_number}/actions"
    params = {"format": "json"}

    try:
        logger.info(f"Fetching bill actions from URL: {url}")
        response = requests.get(url, headers=HEADERS, params=params)
        response.raise_for_status()
        response_data = response.json()

        # Extract actions from the response
        actions = []

        # Check if response contains actions
        if "actions" in response_data and isinstance(response_data["actions"], list):
            for item in response_data["actions"]:
                action = {
                    "date": item.get("actionDate"),
                    "text": item.get("text", ""),
                    "type": item.get("type", "")
                }
                actions.append(action)

        logger.info(f"Found {len(actions)} actions")
        return actions
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching bill actions: {e}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error fetching bill actions: {e}", exc_info=True)
        return []


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
        if "textVersions" in response_data and isinstance(response_data["textVersions"], list):
            for idx, item in enumerate(response_data["textVersions"]):
                # Default values for URLs
                pdf_url = None
                xml_url = None
                formatted_text_url = None

                # Extract format URLs
                if "formats" in item:
                    for format_item in item["formats"]:
                        format_type = format_item.get("type", "")
                        if format_type == "PDF":
                            pdf_url = format_item.get("url", "")
                        elif format_type in ["XML", "Formatted XML"]:
                            xml_url = format_item.get("url", "")
                        elif format_type in ["HTML", "Formatted Text"]:
                            formatted_text_url = format_item.get("url", "")

                # Extract date
                date = item.get("date") if "date" in item else None

                # If date is None, use a fallback unique key for logging and DB
                fallback_key = None
                if not date:
                    fallback_key = f"{item.get('type', 'unknown')}_{idx}"

                # Create text version object
                text_version = {
                    "date": date,  # can be None
                    "pdf_url": pdf_url,
                    "xml_url": xml_url,
                    "formatted_text_url": formatted_text_url,
                    "fallback_key": fallback_key,
                    "type": item.get("type", None),
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


def fetch_bill_summaries(url: str) -> List[Dict[str, Any]]:
    """
    Fetch summaries for a bill using the provided URL from the bill data.
    Converts HTML summary text to plain text.
    Args:
        url: URL to fetch summaries from
    Returns:
        List of summary data dictionaries with plain text
    """
    try:
        # Remove the API base URL if it's included in the URL
        if url.startswith(BASE_URL):
            url = url
        else:
            if not url.startswith("http"):
                url = f"{BASE_URL}{url if url.startswith('/') else '/' + url}"
        if "format=" not in url:
            url = f"{url}{'&' if '?' in url else '?'}format=json"
        logger.info(f"Fetching bill summaries from URL: {url}")
        response = requests.get(url, headers=HEADERS)
        response.raise_for_status()
        response_data = response.json()
        summaries = []
        if "summaries" in response_data and isinstance(response_data["summaries"], list):
            for item in response_data["summaries"]:
                html_text = item.get("text", "")
                plain_text = html2text.html2text(html_text).strip()
                summary = {
                    "date": item.get("actionDate"),
                    "text": plain_text,
                }
                summaries.append(summary)
        logger.info(f"Found {len(summaries)} summaries")
        return summaries
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching summaries: {e}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error fetching summaries: {e}", exc_info=True)
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

    # Extract law information if available
    law_number = None
    law_type = None
    law_enacted_date = None
    law_title = None
    law_unique_id = None

    if "laws" in bill_info and bill_info["laws"]:
        # Take the first law in the list
        law = bill_info["laws"][0]
        law_number = law.get("number", "").split("-")[-1] if "-" in law.get("number", "") else law.get("number", "")
        law_type = law.get("type", "")

        # Generate a unique ID for the law
        if law_number and law_type:
            law_unique_id = f"{law_type.lower()}-{law_number}-{congress}"

        # Get the law title from the bill title
        law_title = title

        # Find the date when the bill became law from the actions
        if "latestAction" in bill_info and "actionDate" in bill_info["latestAction"]:
            action_text = bill_info["latestAction"].get("text", "")
            if "Became Public Law" in action_text or "Became Private Law" in action_text:
                try:
                    law_enacted_date = datetime.strptime(bill_info["latestAction"]["actionDate"], "%Y-%m-%d").date()
                except ValueError:
                    logger.warning(f"Could not parse law enacted date: {bill_info['latestAction']['actionDate']}")

    # Extract summaries information
    summaries_url = None
    if "summaries" in bill_info and isinstance(bill_info["summaries"], dict):
        if "url" in bill_info["summaries"]:
            summaries_url = bill_info["summaries"]["url"]

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
        # Law information
        "law_enacted_date": law_enacted_date.isoformat() if law_enacted_date else None,
        "law_number": law_number,
        "law_type": law_type,
        "law_unique_id": law_unique_id,
        "law_title": law_title,
        "summaries_url": summaries_url,
    }


def download_and_upload_document(
    supabase: Client, url: str, bucket_name: str, file_path: str
) -> Optional[str]:
    """
    Download a document from a URL and upload it to Supabase storage.

    Args:
        supabase: Supabase client
        url: URL to download the document from
        bucket_name: Name of the Supabase storage bucket
        file_path: Path to store the file in the bucket

    Returns:
        Public URL of the uploaded file, or None if download or upload failed
    """
    if not url:
        return None

    try:
        logger.info(f"Downloading document from {url}")
        response = requests.get(url, stream=True)
        response.raise_for_status()

        # Create a temporary file to store the downloaded content
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    temp_file.write(chunk)
            temp_file_path = temp_file.name

        try:
            # Upload to Supabase storage
            logger.info(f"Uploading document to {bucket_name}/{file_path}")
            with open(temp_file_path, "rb") as f:
                result = supabase.storage.from_(bucket_name).upload(
                    file_path, f, file_options={"content-type": response.headers.get("content-type", "")}
                )

            # Get the public URL
            public_url = supabase.storage.from_(bucket_name).get_public_url(file_path)
            logger.info(f"Document uploaded successfully to {public_url}")
            return public_url
        finally:
            # Clean up the temporary file
            os.unlink(temp_file_path)
    except requests.exceptions.RequestException as e:
        logger.error(f"Error downloading document: {e}")
        return None
    except Exception as e:
        logger.error(f"Error uploading document to Supabase: {e}", exc_info=True)
        return None


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

                bill_data = fetch_bill_detail(bill_url)
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
                        # Add law information
                        "law_enacted_date": parsed_bill["law_enacted_date"],
                        "law_number": parsed_bill["law_number"],
                        "law_type": parsed_bill["law_type"],
                        "law_unique_id": parsed_bill["law_unique_id"],
                        "law_title": parsed_bill["law_title"],
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
                        # Add law information
                        "law_enacted_date": parsed_bill["law_enacted_date"],
                        "law_number": parsed_bill["law_number"],
                        "law_type": parsed_bill["law_type"],
                        "law_unique_id": parsed_bill["law_unique_id"],
                        "law_title": parsed_bill["law_title"],
                    }

                    # Insert bill
                    result = supabase.table("bill").insert(bill_insert_data).execute()
                    if not result.data:
                        logger.error(f"Failed to create bill: {bill_unique_id}")
                        continue

                    bill_db_id = result.data[0]["id"]

                # Get existing sponsors and cosponsors to avoid duplicates
                existing_sponsors = supabase.table("sponsored_bills").select("congressman_id").eq("bill_id", bill_db_id).execute()
                existing_sponsor_ids = set()
                if existing_sponsors.data:
                    existing_sponsor_ids = {item["congressman_id"] for item in existing_sponsors.data}

                existing_cosponsors = supabase.table("cosponsored_bills").select("congressman_id").eq("bill_id", bill_db_id).execute()
                existing_cosponsor_ids = set()
                if existing_cosponsors.data:
                    existing_cosponsor_ids = {item["congressman_id"] for item in existing_cosponsors.data}

                logger.info(f"Found {len(existing_sponsor_ids)} existing sponsors and {len(existing_cosponsor_ids)} existing cosponsors for bill: {bill_db_id}")

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

                        # Skip if this sponsor relationship already exists
                        if congressman_id in existing_sponsor_ids:
                            logger.info(f"Skipping existing sponsor relationship for congressman: {bioguide_id}")
                            continue

                        # Add sponsor relationship
                        sponsor_relation = {"bill_id": bill_db_id, "congressman_id": congressman_id}
                        supabase.table("sponsored_bills").insert(sponsor_relation).execute()
                        logger.info(f"Added sponsor relationship for congressman: {bioguide_id}")

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

                        # Skip if this cosponsor relationship already exists
                        if congressman_id in existing_cosponsor_ids:
                            logger.info(f"Skipping existing cosponsor relationship for congressman: {bioguide_id}")
                            continue

                        # Add cosponsor relationship
                        cosponsor_relation = {
                            "bill_id": bill_db_id,
                            "congressman_id": congressman_id,
                        }
                        supabase.table("cosponsored_bills").insert(cosponsor_relation).execute()
                        logger.info(f"Added cosponsor relationship for congressman: {bioguide_id}")

                # Fetch and add text versions if available
                if "text_versions_url" in parsed_bill and parsed_bill["text_versions_url"]:
                    text_versions = fetch_bill_texts(parsed_bill["text_versions_url"])

                    # Get existing text versions for this bill to avoid duplicates
                    existing_text_versions = supabase.table("bill_text").select("date, type, fallback_key").eq("bill_id", bill_db_id).execute()
                    existing_keys = set()
                    if existing_text_versions.data:
                        for item in existing_text_versions.data:
                            # Use date if present, else fallback_key
                            if item.get("date"):
                                existing_keys.add(f"date:{item['date']}")
                            elif item.get("fallback_key"):
                                existing_keys.add(f"fallback:{item['fallback_key']}")

                    logger.info(f"Found {len(existing_keys)} existing text versions for bill: {bill_db_id}")

                    for idx, text_data in enumerate(text_versions):
                        # Use date if present, else fallback_key
                        key = f"date:{text_data['date']}" if text_data.get("date") else f"fallback:{text_data.get('fallback_key', f'unknown_{idx}') }"
                        if key in existing_keys:
                            logger.info(
                                f"Skipping existing text version for key {key} for bill: {bill_db_id}"
                            )
                            continue

                        # Generate unique file paths for storage
                        bill_identifier = f"{parsed_bill['congress']}_{parsed_bill['type']}_{parsed_bill['number']}"
                        # Use date or fallback_key for path
                        date_str = text_data.get("date", text_data.get("fallback_key", f"unknown_{idx}")).replace("-", "").replace(":", "").replace("T", "")
                        # Download and upload PDF, HTML, and XML files to Supabase storage
                        pdf_storage_url = None
                        html_storage_url = None
                        xml_storage_url = None

                        if text_data.get("pdf_url"):
                            pdf_path = f"{bill_identifier}/{date_str}/bill.pdf"
                            pdf_storage_url = download_and_upload_document(
                                supabase, text_data.get("pdf_url"), "bill-pdfs", pdf_path
                            )
                        else:
                            pdf_path = None

                        if text_data.get("formatted_text_url"):
                            html_path = f"{bill_identifier}/{date_str}/bill.html"
                            html_storage_url = download_and_upload_document(
                                supabase, text_data.get("formatted_text_url"), "bill-htmls", html_path
                            )
                        else:
                            html_path = None

                        if text_data.get("xml_url"):
                            xml_path = f"{bill_identifier}/{date_str}/bill.xml"
                            xml_storage_url = download_and_upload_document(
                                supabase, text_data.get("xml_url"), "bill-xmls", xml_path
                            )
                        else:
                            xml_path = None

                        # Create text version record
                        bill_text_data = {
                            "bill_id": bill_db_id,
                            "date": text_data.get("date"),
                            "type": text_data.get("type"),
                            "fallback_key": text_data.get("fallback_key"),
                            "pdf_url": text_data.get("pdf_url"),
                            "xml_url": text_data.get("xml_url"),
                            "html_url": text_data.get("formatted_text_url"),
                            "pdf_file_path": pdf_path,
                            "html_file_path": html_path,
                            "xml_file_path": xml_path,
                        }

                        # Insert text version
                        supabase.table("bill_text").insert(bill_text_data).execute()
                        logger.info(
                            f"Added text version for key {key} for bill: {bill_db_id}"
                        )

                        if pdf_storage_url or html_storage_url or xml_storage_url:
                            logger.info(
                                f"Stored bill documents for {bill_identifier} key {date_str}: "
                                f"PDF: {'✓' if pdf_storage_url else '✗'}, "
                                f"HTML: {'✓' if html_storage_url else '✗'}, "
                                f"XML: {'✓' if xml_storage_url else '✗'}"
                            )

                # Fetch and add bill actions
                bill_actions = fetch_bill_actions(
                    congress, parsed_bill["type"], parsed_bill["number"]
                )

                # Get existing actions for this bill to avoid duplicates
                existing_actions = supabase.table("bill_action").select("date, text").eq("bill_id", bill_db_id).execute()
                existing_action_keys = set()
                if existing_actions.data:
                    existing_action_keys = {f"{item['date']}_{item['text']}" for item in existing_actions.data if item.get("date") and item.get("text")}

                logger.info(f"Found {len(existing_action_keys)} existing actions for bill: {bill_db_id}")

                for action_data in bill_actions:
                    # Skip if date or text is None
                    if not action_data.get("date") or not action_data.get("text"):
                        logger.warning(
                            f"Skipping action with missing date or text for bill: {bill_db_id}"
                        )
                        continue

                    # Create a unique key for this action
                    action_key = f"{action_data['date']}_{action_data['text']}"

                    # Skip if we already have this action
                    if action_key in existing_action_keys:
                        logger.info(
                            f"Skipping existing action for date {action_data.get('date')} for bill: {bill_db_id}"
                        )
                        continue

                    # Create action record
                    bill_action_data = {
                        "bill_id": bill_db_id,
                        "date": action_data.get("date"),
                        "text": action_data.get("text"),
                        "type": action_data.get("type"),
                    }

                    # Insert action
                    supabase.table("bill_action").insert(bill_action_data).execute()
                    logger.info(
                        f"Added action for date {action_data.get('date')} for bill: {bill_db_id}"
                    )

                # After bill_db_id is set (after bill creation/update)
                # Fetch and add bill summaries if available
                if "summaries_url" in parsed_bill and parsed_bill["summaries_url"]:
                    summaries = fetch_bill_summaries(parsed_bill["summaries_url"])
                    # Get existing summaries for this bill to avoid duplicates
                    existing_summaries = supabase.table("bill_summary").select("date, text").eq("bill", bill_db_id).execute()
                    existing_summary_keys = set()
                    if existing_summaries.data:
                        existing_summary_keys = {f"{item['date']}_{item['text']}" for item in existing_summaries.data if item.get("date") and item.get("text")}
                    logger.info(f"Found {len(existing_summary_keys)} existing summaries for bill: {bill_db_id}")
                    for summary in summaries:
                        if not summary.get("date") or not summary.get("text"):
                            logger.warning(f"Skipping summary with missing date or text for bill: {bill_db_id}")
                            continue
                        summary_key = f"{summary['date']}_{summary['text']}"
                        if summary_key in existing_summary_keys:
                            logger.info(f"Skipping existing summary for date {summary.get('date')} for bill: {bill_db_id}")
                            continue
                        bill_summary_data = {
                            "bill": bill_db_id,
                            "date": summary.get("date"),
                            "text": summary.get("text"),
                        }
                        supabase.table("bill_summary").insert(bill_summary_data).execute()
                        logger.info(f"Added summary for date {summary.get('date')} for bill: {bill_db_id}")

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
    parser.add_argument("--congress", type=int, default=119, help="Congress number (default: 119)")
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
