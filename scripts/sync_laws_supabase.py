#!/usr/bin/env python3
"""
Script to sync laws from the Congress API to Supabase.
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


def fetch_laws(
    congress: int, law_type: Optional[str] = None, limit: int = 20, offset: int = 0
) -> Dict[str, Any]:
    """
    Fetch laws from the Congress API

    Args:
        congress: Congress number (e.g., 117 for 117th Congress)
        law_type: Type of law (e.g., 'pub' for public, 'pvt' for private)
        limit: Number of results to return
        offset: Offset for pagination

    Returns:
        Dictionary containing law data
    """
    # Construct the URL based on whether law_type is provided
    if law_type:
        url = f"{BASE_URL}/law/{congress}/{law_type}"
    else:
        url = f"{BASE_URL}/law/{congress}"

    params = {"limit": limit, "offset": offset, "format": "json"}

    try:
        response = requests.get(url, headers=HEADERS, params=params)
        response.raise_for_status()
        response_data = response.json()
        logger.info(f"Laws API Response structure: {list(response_data.keys())}")
        return response_data
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching laws: {e}")
        return {"bills": []}  # Laws API returns bills that became laws


def fetch_law_detail_by_bill(congress: int, bill_type: str, bill_number: int) -> Dict[str, Any]:
    """
    Fetch detailed information about a law from the Congress API

    Args:
        congress: Congress number (e.g., 118 for 118th Congress)
        bill_type: Type of bill (e.g., 'hr' for House Bill)
        bill_number: Bill number

    Returns:
        Dictionary with law detail data
    """
    try:
        # First, we need to fetch the bill to get its law information
        bill_url = f"{BASE_URL}/bill/{congress}/{bill_type}/{bill_number}"
        logger.info(f"Fetching bill detail from URL: {bill_url}")

        response = requests.get(bill_url, headers=HEADERS)
        response.raise_for_status()
        bill_data = response.json()

        # Check if the bill has law information
        if "bill" in bill_data and "laws" in bill_data["bill"] and bill_data["bill"]["laws"]:
            law_info = bill_data["bill"]["laws"][0]

            # Extract law number (e.g., "118-1" -> "1")
            law_number = law_info.get("number", "").split("-")[-1] if "-" in law_info.get("number", "") else law_info.get("number", "")

            # For the law detail API, we always use 'pub' as the law type for public laws
            law_type = "pub"  # Assuming we're dealing with public laws

            # Construct the law detail URL
            law_url = f"{BASE_URL}/law/{congress}/{law_type}/{law_number}"
            logger.info(f"Fetching law detail from URL: {law_url}")

            law_response = requests.get(law_url, headers=HEADERS)
            law_response.raise_for_status()
            return law_response.json()
        else:
            logger.warning(f"No law information found for bill {bill_type}{bill_number}")
            return bill_data  # Return the bill data as fallback

    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching law detail: {e}")
        return {}
    except Exception as e:
        logger.error(f"Unexpected error fetching law detail: {e}", exc_info=True)
        return {}


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


def fetch_law_text_versions(url: str) -> List[Dict[str, Any]]:
    """
    Fetch text versions for a law using the provided URL from the law data

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

        logger.info(f"Fetching law text versions from URL: {url}")

        response = requests.get(url, headers=HEADERS)
        response.raise_for_status()
        response_data = response.json()

        # Extract text versions from the response
        text_versions = []

        # Check if response contains textVersions
        if "textVersions" in response_data and isinstance(response_data["textVersions"], list):
            for item in response_data["textVersions"]:
                # Default values for URLs
                pdf_url = None
                xml_url = None
                html_url = None

                # Extract format URLs
                if "formats" in item:
                    for format_item in item["formats"]:
                        format_type = format_item.get("type", "")
                        format_url = format_item.get("url", "")

                        if "PDF" in format_type:
                            pdf_url = format_url
                        elif "XML" in format_type:
                            xml_url = format_url
                        elif "HTML" in format_type or "Formatted Text" in format_type:
                            html_url = format_url

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
                    "html_url": html_url,
                }
                text_versions.append(text_version)

        logger.info(f"Found {len(text_versions)} law text versions")
        return text_versions
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching law text versions: {e}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error fetching law text versions: {e}", exc_info=True)
        return []


def fetch_related_bills(url: str) -> List[Dict[str, Any]]:
    """
    Fetch related bills for a law using the provided URL from the law data

    Args:
        url: URL to fetch related bills from

    Returns:
        List of related bill data dictionaries
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

        logger.info(f"Fetching related bills from URL: {url}")

        response = requests.get(url, headers=HEADERS)
        response.raise_for_status()
        response_data = response.json()

        # Extract related bills from the response
        related_bills = []

        # Check if response contains relatedBills
        if "relatedBills" in response_data and isinstance(response_data["relatedBills"], list):
            for item in response_data["relatedBills"]:
                bill_type = item.get("type", "").lower()
                bill_number = item.get("number")
                congress = item.get("congress")

                # Create bill_unique_id in the format used by the bills table: {type}{number}-{congress}
                bill_unique_id = f"{bill_type}{bill_number}-{congress}"

                related_bill = {
                    "congress": congress,
                    "number": bill_number,
                    "type": bill_type,
                    "bill_unique_id": bill_unique_id,
                }
                related_bills.append(related_bill)

        logger.info(f"Found {len(related_bills)} related bills")
        return related_bills
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching related bills: {e}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error fetching related bills: {e}", exc_info=True)
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

        # Extract text versions from the response
        text_versions = []

        # Check if response contains textVersions
        if "textVersions" in response_data:
            for item in response_data["textVersions"]:
                # Default values for URLs
                pdf_url = None
                xml_url = None
                html_url = None

                # Extract format URLs
                if "formats" in item:
                    for format_item in item["formats"]:
                        format_type = format_item.get("type", "")
                        format_url = format_item.get("url", "")

                        if "PDF" in format_type:
                            pdf_url = format_url
                        elif "XML" in format_type:
                            xml_url = format_url
                        elif "HTML" in format_type or "Formatted Text" in format_type:
                            html_url = format_url

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
                    "html_url": html_url,
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


def parse_law_data(law_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse law data from the Congress API

    Args:
        law_data: Law data from the Congress API

    Returns:
        Dictionary with parsed law data
    """
    try:
        # Extract bill data from the response
        bill_data = law_data.get("bill", {})

        # Extract law information from the bill data
        laws_data = bill_data.get("laws", [])
        if not laws_data:
            logger.warning("No law information found in bill data")
            return None

        # Get the first law (there should only be one)
        law_info = laws_data[0]

        # Extract law type and number
        law_type = law_info.get("type", "").lower()
        law_number = law_info.get("number")

        # Extract congress number
        congress = bill_data.get("congress")

        # Create law ID
        law_id = f"{law_type}{law_number}-{congress}"

        # Extract bill type and number for bill ID
        bill_type = bill_data.get("type", "").lower()
        bill_number = bill_data.get("number")

        # Create bill ID
        bill_id = f"{bill_type}{bill_number}-{congress}"

        # Extract enacted date
        enacted_date = None
        if "latestAction" in bill_data and bill_data["latestAction"]:
            latest_action = bill_data["latestAction"]
            if latest_action.get('text').lower().startswith('became public law'):
                enacted_date = latest_action.get('actionDate')

        # Extract title
        title = bill_data.get("title", "")

        # Extract policy area
        policy_area = None
        if "policyArea" in bill_data and "name" in bill_data["policyArea"]:
            policy_area = bill_data["policyArea"]["name"]

        # Create parsed law data
        parsed_law = {
            "congress": congress,
            "law_id": law_id,
            "law_type": law_type,
            "law_number": law_number,
            "title": title,
            "enacted_date": enacted_date,
            "bill_id": bill_id,
            "policy_area": policy_area,
            "text_versions_url": bill_data.get("textVersions", {}).get("url") if "textVersions" in bill_data else None,
            "related_bills_url": bill_data.get("relatedBills", {}).get("url") if "relatedBills" in bill_data else None,
        }

        return parsed_law
    except Exception as e:
        logger.error(f"Error parsing law data: {e}", exc_info=True)
        return None


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


def sync_laws_to_supabase(
    supabase: Client,
    congress: int = 118,
    law_type: Optional[str] = None,
    limit: int = 20,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """
    Sync laws from the Congress API to Supabase

    Args:
        supabase: Supabase client
        congress: Congress number (e.g., 118 for 118th Congress)
        law_type: Type of law (e.g., 'pub' for public, 'pvt' for private)
        limit: Number of laws to fetch
        offset: Offset for pagination

    Returns:
        List of dictionaries representing laws that were created or updated
    """
    synced_laws = []

    try:
        # Fetch laws from the Congress API
        law_list = fetch_laws(congress=congress, law_type=law_type, limit=limit, offset=offset)

        # Process each bill that became a law
        for bill_item in law_list.get("bills", []):
            try:
                # Check if the bill has law information
                if "laws" not in bill_item or not bill_item["laws"]:
                    logger.debug(f"Bill {bill_item.get('number')} has no law information, skipping")
                    continue

                # Get the bill type and number for fetching detailed information
                bill_type = bill_item.get("type", "").lower()
                bill_number = bill_item.get("number", "")

                # Validate bill type and number
                if not bill_type or not bill_number:
                    logger.warning(
                        f"Invalid bill type or number: type={bill_type}, number={bill_number}"
                    )
                    continue

                # Fetch detailed information about the bill that became law
                bill_detail = fetch_law_detail_by_bill(congress, bill_type, int(bill_number))

                # Validate bill detail response
                if not bill_detail or "bill" not in bill_detail:
                    logger.warning(f"Invalid bill detail response for {bill_type}{bill_number}")
                    continue

                # Parse the law data
                law_data = parse_law_data(bill_detail)
                if not law_data:
                    logger.warning(f"Could not parse law data for bill {bill_type}{bill_number}")
                    continue

                # Create a unique bill_unique_id
                bill_unique_id = law_data["bill_id"]

                # Check if the bill exists in Supabase
                result = (
                    supabase.table("bill")
                    .select("id")
                    .eq("bill_unique_id", bill_unique_id)
                    .execute()
                )
                bill_db_id = result.data[0]["id"] if result.data else None

                if not bill_db_id:
                    logger.info(f"Bill {bill_unique_id} not found in Supabase, syncing it first")

                    # Parse bill type and number from bill_unique_id (format: {type}{number}-{congress})
                    bill_parts = bill_unique_id.split("-")
                    if len(bill_parts) != 2:
                        logger.warning(f"Invalid bill_unique_id format: {bill_unique_id}")
                        continue

                    bill_type_number = bill_parts[0]
                    # Extract the bill type (letters) and number (digits)
                    import re
                    bill_type_match = re.match(r'^([a-z]+)(\d+)$', bill_type_number)
                    if not bill_type_match:
                        logger.warning(f"Could not parse bill type and number from {bill_type_number}")
                        continue

                    bill_type = bill_type_match.group(1)
                    bill_number = int(bill_type_match.group(2))

                    # Sync the bill to Supabase
                    bill_db_id = sync_bill_to_supabase(supabase, congress, bill_type, bill_number)

                    if not bill_db_id:
                        logger.warning(f"Failed to sync bill {bill_unique_id}, skipping law")
                        continue

                    logger.info(f"Successfully synced bill {bill_unique_id} with ID {bill_db_id}")

                # Check if law already exists in Supabase
                law_id = law_data["law_id"]
                result = (
                    supabase.table("law")
                    .select("id")
                    .eq("unique_id", law_id)
                    .execute()
                )
                existing_law = result.data[0] if result.data else None

                if existing_law:
                    # Update existing law
                    law_db_id = existing_law["id"]
                    logger.info(f"Updating law: {law_id}")

                    # Parse enacted_date to ISO format if it's a string
                    enacted_date = law_data["enacted_date"]
                    if enacted_date and isinstance(enacted_date, str):
                        try:
                            enacted_date = datetime.strptime(enacted_date, "%Y-%m-%d").date().isoformat()
                        except ValueError:
                            logger.warning(f"Could not parse enacted_date: {enacted_date}")
                            enacted_date = None

                    # Update law data
                    law_update_data = {
                        "title": law_data["title"],
                        "enacted_date": enacted_date,
                        "policy_area": law_data["policy_area"],
                    }
                    supabase.table("law").update(law_update_data).eq("id", law_db_id).execute()
                else:
                    # Create new law
                    logger.info(f"Creating new law: {law_id}")

                    # Parse enacted_date to ISO format if it's a string
                    enacted_date = law_data["enacted_date"]
                    if enacted_date and isinstance(enacted_date, str):
                        try:
                            enacted_date = datetime.strptime(enacted_date, "%Y-%m-%d").date().isoformat()
                        except ValueError:
                            logger.warning(f"Could not parse enacted_date: {enacted_date}")
                            enacted_date = None

                    # Prepare law data for insertion
                    law_insert_data = {
                        "congress": law_data["congress"],
                        "unique_id": law_data["law_id"],
                        "type": law_data["law_type"],
                        "number": law_data["law_number"],
                        "title": law_data["title"],
                        "enacted_date": enacted_date,
                        "policy_area": law_data["policy_area"],
                    }

                    # Insert law
                    result = supabase.table("law").insert(law_insert_data).execute()
                    if not result.data:
                        logger.error(f"Failed to create law: {law_id}")
                        continue

                    law_db_id = result.data[0]["id"]

                # Check if the bill-law relationship already exists
                result = (
                    supabase.table("bills_laws")
                    .select("id")
                    .eq("bill_id", bill_db_id)
                    .eq("law_id", law_db_id)
                    .execute()
                )
                existing_relationship = result.data[0] if result.data else None

                if not existing_relationship:
                    # Create the bill-law relationship
                    bill_law_data = {
                        "bill_id": bill_db_id,
                        "law_id": law_db_id,
                    }
                    supabase.table("bills_laws").insert(bill_law_data).execute()
                    logger.info(f"Created bill-law relationship: bill {bill_db_id} -> law {law_db_id}")

                # Fetch and add text versions if available
                if "text_versions_url" in law_data and law_data["text_versions_url"]:
                    text_versions = fetch_law_text_versions(law_data["text_versions_url"])

                    # Get existing text versions for this law to avoid duplicates
                    existing_text_versions = supabase.table("law_text").select("date").eq("law_id", law_db_id).execute()
                    existing_dates = set()
                    if existing_text_versions.data:
                        existing_dates = {item["date"] for item in existing_text_versions.data if item.get("date")}

                    logger.info(f"Found {len(existing_dates)} existing text versions for law: {law_db_id}")

                    for text_data in text_versions:
                        # Skip if date is None
                        if not text_data.get("date"):
                            logger.warning(
                                f"Skipping text version with no date for law: {law_db_id}"
                            )
                            continue

                        # Skip if we already have this version
                        if text_data.get("date") in existing_dates:
                            logger.info(
                                f"Skipping existing text version for date {text_data.get('date')} for law: {law_db_id}"
                            )
                            continue

                        # Generate unique file paths for storage
                        law_identifier = f"{law_data['congress']}_{law_data['law_type']}_{law_data['law_number']}"
                        date_str = text_data.get("date", "").replace("-", "")

                        # Download and upload PDF, HTML, and XML files to Supabase storage
                        pdf_storage_url = None
                        html_storage_url = None
                        xml_storage_url = None

                        if text_data.get("pdf_url"):
                            pdf_path = f"{law_identifier}/{date_str}/law.pdf"
                            pdf_storage_url = download_and_upload_document(
                                supabase, text_data.get("pdf_url"), "law-pdfs", pdf_path
                            )

                        if text_data.get("html_url"):
                            html_path = f"{law_identifier}/{date_str}/law.html"
                            html_storage_url = download_and_upload_document(
                                supabase, text_data.get("html_url"), "law-htmls", html_path
                            )

                        if text_data.get("xml_url"):
                            xml_path = f"{law_identifier}/{date_str}/law.xml"
                            xml_storage_url = download_and_upload_document(
                                supabase, text_data.get("xml_url"), "law-xmls", xml_path
                            )

                        # Create text version record
                        law_text_data = {
                            "law_id": law_db_id,
                            "date": text_data.get("date"),
                            "pdf_url": text_data.get("pdf_url"),
                            "xml_url": text_data.get("xml_url"),
                            "html_url": text_data.get("html_url"),
                            "pdf_file_path": pdf_path if text_data.get("pdf_url") else None,
                            "html_file_path": html_path if text_data.get("html_url") else None,
                            "xml_file_path": xml_path if text_data.get("xml_url") else None,
                        }

                        # Insert text version
                        supabase.table("law_text").insert(law_text_data).execute()
                        logger.info(
                            f"Added text version for date {text_data.get('date')} for law: {law_db_id}"
                        )

                        if pdf_storage_url or html_storage_url or xml_storage_url:
                            logger.info(
                                f"Stored law documents for {law_identifier} date {date_str}: "
                                f"PDF: {'✓' if pdf_storage_url else '✗'}, "
                                f"HTML: {'✓' if html_storage_url else '✗'}, "
                                f"XML: {'✓' if xml_storage_url else '✗'}"
                            )

                # Fetch and process related bills
                if "related_bills_url" in law_data and law_data["related_bills_url"]:
                    related_bills = fetch_related_bills(law_data["related_bills_url"])

                    for related_bill in related_bills:
                        # Get the bill_unique_id from the related bill data
                        related_bill_unique_id = related_bill["bill_unique_id"]

                        # Check if the related bill exists in Supabase
                        result = (
                            supabase.table("bill")
                            .select("id")
                            .eq("bill_unique_id", related_bill_unique_id)
                            .execute()
                        )
                        related_bill_db_id = result.data[0]["id"] if result.data else None

                        if related_bill_db_id:
                            # Check if this relationship already exists in bills_laws
                            result = (
                                supabase.table("bills_laws")
                                .select("id")
                                .eq("bill_id", related_bill_db_id)
                                .eq("law_id", law_db_id)
                                .execute()
                            )
                            existing_relationship = result.data[0] if result.data else None

                            if not existing_relationship:
                                # Create the bill-law relationship
                                bill_law_data = {
                                    "bill_id": related_bill_db_id,
                                    "law_id": law_db_id,
                                }
                                supabase.table("bills_laws").insert(bill_law_data).execute()
                                logger.info(f"Created bill-law relationship: bill {related_bill_db_id} -> law {law_db_id} (relationship: {related_bill['relationship']})")
                        else:
                            logger.info(f"Related bill {related_bill_unique_id} not found in Supabase, skipping relationship")

                # Add law to synced list
                synced_laws.append(law_data)

            except Exception as e:
                logger.error(f"Error processing law: {e}", exc_info=True)
                continue

        return synced_laws
    except Exception as e:
        logger.error(f"Error syncing laws: {e}", exc_info=True)
        return []


def sync_bill_to_supabase(supabase: Client, congress: int, bill_type: str, bill_number: int) -> Optional[str]:
    """
    Sync a specific bill to Supabase if it doesn't exist yet

    Args:
        supabase: Supabase client
        congress: Congress number (e.g., 118 for 118th Congress)
        bill_type: Type of bill (e.g., 'hr' for House Bill)
        bill_number: Bill number

    Returns:
        Bill database ID if successful, None otherwise
    """
    try:
        # Generate bill_unique_id
        bill_unique_id = f"{bill_type.lower()}{bill_number}-{congress}"

        # Check if bill already exists in Supabase
        result = (
            supabase.table("bill")
            .select("id")
            .eq("bill_unique_id", bill_unique_id)
            .execute()
        )

        if result.data:
            # Bill already exists, return its ID
            logger.info(f"Bill {bill_unique_id} already exists in Supabase")
            return result.data[0]["id"]

        # Fetch detailed bill information
        logger.info(f"Fetching bill detail for {bill_type}{bill_number} in the {congress}th Congress")
        bill_data = fetch_bill_detail(congress, bill_type, bill_number)

        if not bill_data or "bill" not in bill_data:
            logger.warning(f"No data found for bill {bill_type}{bill_number}")
            return None

        # Parse bill data
        bill_info = bill_data.get("bill", {})

        # Extract basic bill information
        title = bill_info.get("title", "")

        # Parse introduced date
        introduced_date = None
        if "introducedDate" in bill_info:
            try:
                introduced_date = datetime.strptime(bill_info["introducedDate"], "%Y-%m-%d").date().isoformat()
            except ValueError:
                logger.warning(f"Could not parse introduced date: {bill_info['introducedDate']}")

        # Extract policy areas
        policy_area = None
        if "policyArea" in bill_info and "name" in bill_info["policyArea"]:
            policy_area = bill_info["policyArea"]["name"]

        # Create bill record
        bill_insert_data = {
            "congress": congress,
            "type": bill_type.lower(),
            "number": bill_number,
            "bill_unique_id": bill_unique_id,
            "title": title,
            "introduced_date": introduced_date,
            "policy_area": policy_area,
        }

        # Insert bill
        result = supabase.table("bill").insert(bill_insert_data).execute()
        if not result.data:
            logger.error(f"Failed to create bill: {bill_unique_id}")
            return None

        bill_db_id = result.data[0]["id"]
        logger.info(f"Created new bill: {bill_unique_id} with ID {bill_db_id}")

        # Handle sponsors if available
        if "sponsors" in bill_info and bill_info["sponsors"]:
            for sponsor_data in bill_info["sponsors"]:
                bioguide_id = sponsor_data.get("bioguideId")
                if not bioguide_id:
                    continue

                # Check if congressman exists
                congressman_result = (
                    supabase.table("congressman")
                    .select("id")
                    .eq("bioguide_id", bioguide_id)
                    .execute()
                )

                if congressman_result.data:
                    congressman_id = congressman_result.data[0]["id"]

                    # Create sponsored_bills record
                    sponsored_bill_data = {
                        "bill_id": bill_db_id,
                        "congressman_id": congressman_id,
                    }

                    supabase.table("sponsored_bills").insert(sponsored_bill_data).execute()
                    logger.info(f"Added sponsor {bioguide_id} to bill {bill_unique_id}")

        # Handle cosponsors if available
        if "cosponsors" in bill_info and isinstance(bill_info["cosponsors"], dict) and "url" in bill_info["cosponsors"]:
            cosponsor_url = bill_info["cosponsors"]["url"]
            cosponsors = fetch_bill_cosponsors(cosponsor_url)

            for cosponsor_data in cosponsors:
                bioguide_id = cosponsor_data.get("bioguide_id")
                if not bioguide_id:
                    continue

                # Check if congressman exists
                congressman_result = (
                    supabase.table("congressman")
                    .select("id")
                    .eq("bioguide_id", bioguide_id)
                    .execute()
                )

                if congressman_result.data:
                    congressman_id = congressman_result.data[0]["id"]

                    # Create cosponsored_bills record
                    cosponsored_bill_data = {
                        "bill_id": bill_db_id,
                        "congressman_id": congressman_id,
                    }

                    supabase.table("cosponsored_bills").insert(cosponsored_bill_data).execute()
                    logger.info(f"Added cosponsor {bioguide_id} to bill {bill_unique_id}")

        # Handle text versions if available
        if "textVersions" in bill_info and isinstance(bill_info["textVersions"], dict) and "url" in bill_info["textVersions"]:
            text_versions_url = bill_info["textVersions"]["url"]
            text_versions = fetch_bill_texts(text_versions_url)

            for text_data in text_versions:
                # Skip if date is None
                if not text_data.get("date"):
                    continue

                # Generate unique file paths for storage
                bill_identifier = f"{congress}_{bill_type}_{bill_number}"
                date_str = text_data.get("date", "").replace("-", "")

                # Download and upload PDF, HTML, and XML files to Supabase storage
                pdf_storage_url = None
                html_storage_url = None
                xml_storage_url = None

                if text_data.get("pdf_url"):
                    pdf_path = f"{bill_identifier}/{date_str}/bill.pdf"
                    pdf_storage_url = download_and_upload_document(
                        supabase, text_data.get("pdf_url"), "bill-pdfs", pdf_path
                    )

                if text_data.get("html_url"):
                    html_path = f"{bill_identifier}/{date_str}/bill.html"
                    html_storage_url = download_and_upload_document(
                        supabase, text_data.get("html_url"), "bill-htmls", html_path
                    )

                if text_data.get("xml_url"):
                    xml_path = f"{bill_identifier}/{date_str}/bill.xml"
                    xml_storage_url = download_and_upload_document(
                        supabase, text_data.get("xml_url"), "bill-xmls", xml_path
                    )

                # Create text version record
                bill_text_data = {
                    "bill_id": bill_db_id,
                    "date": text_data.get("date"),
                    "pdf_url": text_data.get("pdf_url"),
                    "xml_url": text_data.get("xml_url"),
                    "html_url": text_data.get("html_url"),
                    "pdf_file_path": pdf_path if text_data.get("pdf_url") else None,
                    "html_file_path": html_path if text_data.get("html_url") else None,
                    "xml_file_path": xml_path if text_data.get("xml_url") else None,
                }

                # Insert text version
                supabase.table("bill_text").insert(bill_text_data).execute()
                logger.info(f"Added text version for date {text_data.get('date')} for bill: {bill_unique_id}")

        return bill_db_id
    except Exception as e:
        logger.error(f"Error syncing bill to Supabase: {e}", exc_info=True)
        return None


def main():
    """
    Main function to run the script
    """
    parser = argparse.ArgumentParser(description="Sync laws from Congress API to Supabase")
    parser.add_argument(
        "--congress", type=int, default=118, help="Congress number (e.g., 118 for 118th Congress)"
    )
    parser.add_argument(
        "--law-type",
        type=str,
        default=None,
        choices=["pub", "pvt", None],
        help="Type of law (e.g., 'pub' for public, 'pvt' for private)",
    )
    parser.add_argument(
        "--limit", type=int, default=20, help="Number of laws to fetch"
    )
    parser.add_argument(
        "--offset", type=int, default=0, help="Offset for pagination"
    )
    args = parser.parse_args()

    # Initialize Supabase client
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")

    if not supabase_url or not supabase_key:
        logger.error("SUPABASE_URL and SUPABASE_KEY environment variables must be set")
        sys.exit(1)

    supabase = create_client(supabase_url, supabase_key)

    # Sync laws to Supabase
    synced_laws = sync_laws_to_supabase(
        supabase,
        congress=args.congress,
        law_type=args.law_type,
        limit=args.limit,
        offset=args.offset,
    )

    logger.info(f"Synced {len(synced_laws)} laws to Supabase")


if __name__ == "__main__":
    main()
