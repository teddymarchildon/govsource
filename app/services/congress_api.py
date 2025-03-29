import logging
import os
from datetime import date, datetime
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from app.models.congress import (
    Bill,
    BillText,
    Chamber,
    Congressman,
    CongressmanTerm,
    Law,
    LawText,
    Party,
    PolicyArea,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# API Configuration
API_KEY = os.getenv("CONGRESS_API_KEY")
BASE_URL = "https://api.congress.gov/v3"
HEADERS = {"X-API-Key": API_KEY}


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
        response = requests.get(url, headers=HEADERS, params=params)  # type: ignore
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


def fetch_members(limit: int = 100, offset: int = 0) -> Dict[str, Any]:
    """
    Fetch members of Congress

    Args:
        limit: Number of results to return
        offset: Offset for pagination

    Returns:
        Dictionary containing member data
    """
    url = f"{BASE_URL}/member"
    params = {"limit": limit, "offset": offset, "format": "json"}

    try:
        response = requests.get(url, headers=HEADERS, params=params)  # type: ignore
        response.raise_for_status()
        response_data = response.json()
        logger.info(f"API Response structure: {list(response_data.keys())}")
        return response_data
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching members: {e}")
        return {"members": []}


def fetch_member_detail(bioguide_id: str) -> Dict[str, Any]:
    """
    Fetch detailed information for a specific member of Congress

    Args:
        bioguide_id: Bioguide ID of the member

    Returns:
        Dictionary containing member data
    """
    url = f"{BASE_URL}/member/{bioguide_id}"
    params = {"format": "json"}

    try:
        response = requests.get(url, headers=HEADERS, params=params)
        response.raise_for_status()
        response_data = response.json()

        # Log the structure of the response
        logger.info(f"Member detail response structure: {list(response_data.keys())}")

        return response_data
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching member detail for {bioguide_id}: {e}")
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
                    "date": date_obj,
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
        "bill_type": bill_type,
        "bill_number": bill_number,
        "bill_id": bill_id,
        "title": title,
        "introduced_date": introduced_date,
        "policy_areas": policy_areas,
        "sponsors": sponsors,
        "cosponsor_count": cosponsor_count,
        "cosponsor_url": cosponsor_url,
        "text_versions_count": text_versions_count,
        "text_versions_url": text_versions_url,
    }


def sync_bills(db: Session, congress: int = 118, limit: int = 20, offset: int = 0) -> List[Bill]:
    """
    Sync bills from the Congress API to the database

    Args:
        db: Database session
        congress: Congress number (e.g., 118 for 118th Congress)
        limit: Number of bills to fetch
        offset: Offset for pagination

    Returns:
        List of synced bills
    """
    bills = []

    try:
        # Fetch bills from the Congress API
        bill_list = fetch_bills(congress=congress, limit=limit, offset=offset)
        # Process each bill
        for bill_item in bill_list["bills"]:
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

                # Check if bill already exists in the database
                bill = db.query(Bill).filter(Bill.bill_id == parsed_bill["bill_id"]).first()

                if bill:
                    # Update existing bill
                    logger.info(f"Updating bill: {parsed_bill['bill_id']}")
                    bill.title = parsed_bill["title"]
                    bill.introduced_date = parsed_bill["introduced_date"]
                    bill.policy_areas = parsed_bill["policy_areas"]
                else:
                    # Create new bill
                    logger.info(f"Creating new bill: {parsed_bill['bill_id']}")
                    bill = Bill(
                        congress=parsed_bill["congress"],
                        bill_id=parsed_bill["bill_id"],
                        bill_type=parsed_bill["bill_type"],
                        bill_number=parsed_bill["bill_number"],
                        title=parsed_bill["title"],
                        introduced_date=parsed_bill["introduced_date"],
                        policy_areas=parsed_bill["policy_areas"],
                    )
                    db.add(bill)

                # Clear existing sponsors and cosponsors
                bill.sponsors = []
                bill.cosponsors = []

                # Add sponsors
                if "sponsors" in parsed_bill and parsed_bill["sponsors"]:
                    for sponsor_data in parsed_bill["sponsors"]:
                        bioguide_id = sponsor_data.get("bioguide_id")
                        if not bioguide_id:
                            logger.warning(f"No bioguide ID found for sponsor: {sponsor_data}")
                            continue

                        # Check if congressman exists
                        congressman = (
                            db.query(Congressman)
                            .filter(Congressman.bioguide_id == bioguide_id)
                            .first()
                        )

                        if not congressman:
                            # Fetch congressman details if not in database
                            logger.info(f"Fetching details for congressman: {bioguide_id}")
                            member_data = fetch_member_detail(bioguide_id)
                            if member_data:
                                member_info = parse_member_data(member_data)
                                congressman = Congressman(
                                    bioguide_id=bioguide_id,
                                    first_name=sponsor_data.get("first_name", ""),
                                    last_name=sponsor_data.get("last_name", ""),
                                    full_name=sponsor_data.get("full_name", ""),
                                    party=member_info.get("party", Party.OTHER),
                                    chamber=member_info.get("chamber", Chamber.HOUSE),
                                    state=sponsor_data.get("state", ""),
                                    district=sponsor_data.get("district", ""),
                                )
                                db.add(congressman)
                                db.flush()  # Flush to get the ID
                            else:
                                logger.warning(
                                    f"Could not fetch details for congressman: {bioguide_id}"
                                )
                                continue

                        # Add sponsor relationship
                        bill.sponsors.append(congressman)

                # Fetch and add cosponsors if available
                if "cosponsor_url" in parsed_bill and parsed_bill["cosponsor_url"]:
                    cosponsors = fetch_bill_cosponsors(parsed_bill["cosponsor_url"])

                    for cosponsor_data in cosponsors:
                        bioguide_id = cosponsor_data.get("bioguide_id")
                        if not bioguide_id:
                            logger.warning(f"No bioguide ID found for cosponsor: {cosponsor_data}")
                            continue

                        # Check if congressman exists
                        congressman = (
                            db.query(Congressman)
                            .filter(Congressman.bioguide_id == bioguide_id)
                            .first()
                        )

                        if not congressman:
                            # Fetch congressman details if not in database
                            logger.info(f"Fetching details for congressman: {bioguide_id}")
                            member_data = fetch_member_detail(bioguide_id)
                            if member_data:
                                member_info = parse_member_data(member_data)
                                congressman = Congressman(
                                    bioguide_id=bioguide_id,
                                    first_name=cosponsor_data.get("first_name", ""),
                                    last_name=cosponsor_data.get("last_name", ""),
                                    full_name=cosponsor_data.get("full_name", ""),
                                    party=member_info.get("party", Party.OTHER),
                                    chamber=member_info.get("chamber", Chamber.HOUSE),
                                    state=cosponsor_data.get("state", ""),
                                    district=cosponsor_data.get("district", ""),
                                )
                                db.add(congressman)
                                db.flush()  # Flush to get the ID
                            else:
                                logger.warning(
                                    f"Could not fetch details for congressman: {bioguide_id}"
                                )
                                continue

                        # Add cosponsor relationship
                        bill.cosponsors.append(congressman)

                # Fetch and add text versions if available
                if "text_versions_url" in parsed_bill and parsed_bill["text_versions_url"]:
                    text_versions = fetch_bill_texts(parsed_bill["text_versions_url"])

                    for text_data in text_versions:
                        # Skip if date is None
                        if not text_data.get("date"):
                            logger.warning(
                                f"Skipping text version with no date for bill: {bill.bill_id}"
                            )
                            continue

                        # Check if this text version already exists
                        existing_text = (
                            db.query(BillText)
                            .filter(
                                BillText.formatted_bill_id == bill.bill_id,
                                BillText.date == text_data.get("date"),
                            )
                            .first()
                        )

                        if existing_text:
                            logger.info(
                                f"Text version for date {text_data.get('date')} already exists for bill: {bill.bill_id}"
                            )
                            # Optionally update URLs if they've changed
                            if (
                                existing_text.pdf_url != text_data.get("pdf_url")
                                or existing_text.xml_url != text_data.get("xml_url")
                                or existing_text.formatted_text_url
                                != text_data.get("formatted_text_url")
                            ):
                                logger.info(f"Updating URLs for existing text version")
                                existing_text.pdf_url = text_data.get("pdf_url")
                                existing_text.xml_url = text_data.get("xml_url")
                                existing_text.formatted_text_url = text_data.get(
                                    "formatted_text_url"
                                )
                            continue

                        # Create new text version if it doesn't exist
                        bill_text = BillText(
                            formatted_bill_id=bill.bill_id,
                            type=text_data.get("type", ""),
                            date=text_data.get("date"),
                            pdf_url=text_data.get("pdf_url"),
                            xml_url=text_data.get("xml_url"),
                            formatted_text_url=text_data.get("formatted_text_url"),
                        )
                        db.add(bill_text)
                        logger.info(
                            f"Added new text version for date {text_data.get('date')} for bill: {bill.bill_id}"
                        )
                # Commit changes for this bill
                db.commit()
                bills.append(bill)

            except Exception as e:
                # Rollback transaction for this bill
                db.rollback()
                logger.error(f"Error processing bill: {e}", exc_info=True)
                continue

        return bills
    except Exception as e:
        db.rollback()
        logger.error(f"Error syncing bills: {e}", exc_info=True)
        return []


def sync_members(db: Session, limit: int = 100, offset: int = 0) -> List[Congressman]:
    """
    Sync members from the Congress API to the database

    Args:
        db: Database session
        limit: Number of members to fetch
        offset: Offset for pagination

    Returns:
        List of Congressman objects that were created or updated
    """
    from app.models.congress import Chamber, Congressman, CongressmanTerm

    logger.info(f"Syncing up to {limit} members starting from offset {offset}")

    # Fetch members from the API
    response_data = fetch_members(limit, offset)

    # Check if we have members in the response
    if "members" not in response_data or not response_data["members"]:
        logger.warning("No members found in the API response")
        return []

    # Process each member
    synced_members = []
    for member_item in response_data["members"]:
        try:
            # Get the bioguide ID
            bioguide_id = member_item.get("bioguideId")
            if not bioguide_id:
                logger.warning("Member missing bioguide ID, skipping")
                continue

            # Fetch detailed information about the member
            member_detail = fetch_member_detail(bioguide_id)

            # Parse the member data
            member_data = parse_member_data(member_detail)
            if not member_data:
                logger.warning(f"Could not parse data for member {bioguide_id}, skipping")
                continue

            # Check if the member already exists in our database
            existing_member = (
                db.query(Congressman).filter(Congressman.bioguide_id == bioguide_id).first()
            )

            if existing_member:
                logger.info(f"Member {bioguide_id} already exists, updating")

                # Update the existing member
                for key, value in member_data.items():
                    if key != "bioguide_id":  # Don't update the bioguide_id
                        setattr(existing_member, key, value)

                member = existing_member
            else:
                logger.info(f"Creating new member {bioguide_id}")

                # Create a new member
                member = Congressman(**member_data)
                db.add(member)

            # Commit to get the member ID
            db.commit()
            db.refresh(member)

            # Process terms if available in the member detail
            if "terms" in member_detail.get("member", {}) and isinstance(
                member_detail["member"]["terms"], list
            ):
                # Clear existing terms for this member to avoid duplicates
                db.query(CongressmanTerm).filter(
                    CongressmanTerm.congressman_id == member.id
                ).delete()

                # Process each term
                for term_data in member_detail["member"]["terms"]:
                    # Extract term information
                    congress = term_data.get("congress")
                    chamber_name = term_data.get("chamber")
                    start_year = term_data.get("startYear")
                    end_year = term_data.get("endYear")
                    state_code = term_data.get("stateCode")
                    state_name = term_data.get("stateName")
                    district = term_data.get("district")
                    member_type = term_data.get("memberType")

                    # Skip if missing required fields
                    if not congress or not chamber_name or not start_year:
                        logger.warning(
                            f"Term missing required fields for member {bioguide_id}, skipping term"
                        )
                        continue

                    # Map chamber name to string value
                    chamber_value = "house"
                    if chamber_name.upper() == "SENATE":
                        chamber_value = "senate"

                    # Create term record
                    term = CongressmanTerm(
                        congressman_id=member.id,
                        congress=congress,
                        chamber=chamber_value,
                        start_year=start_year,
                        end_year=end_year,
                        state_code=state_code or "",
                        state_name=state_name or "",
                        district=str(district) if district else None,
                        member_type=member_type or "",
                    )

                    db.add(term)

                # Commit the terms
                db.commit()

            synced_members.append(member)

        except Exception as e:
            logger.error(f"Error syncing member {member_item.get('bioguideId')}: {e}")
            db.rollback()

    logger.info(f"Successfully synced {len(synced_members)} members")
    return synced_members


def parse_member_data(member_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse member data from the Congress API into our model format

    Args:
        member_data: Member data from the Congress API

    Returns:
        Dictionary with parsed member data
    """
    try:
        # Extract member info from the response
        if "member" in member_data:
            member_info = member_data["member"]
        else:
            # Try to find the member data in the response
            for key in member_data.keys():
                if isinstance(member_data[key], dict) and "bioguideId" in member_data[key]:
                    member_info = member_data[key]
                    break
            else:
                # If we can't find the member data, log the structure and return empty
                logger.error(
                    f"Could not find member data in response. Keys: {list(member_data.keys())}"
                )
                return {}

        # Log the structure of the member info to understand its format
        logger.info(
            f"Member info structure: {member_info.keys() if isinstance(member_info, dict) else 'Not a dictionary'}"
        )

        # Extract bioguide ID
        bioguide_id = None
        if "bioguideId" in member_info:
            bioguide_id = member_info["bioguideId"]
        elif "bioguideID" in member_info:
            bioguide_id = member_info["bioguideID"]
        elif "bioguide_id" in member_info:
            bioguide_id = member_info["bioguide_id"]
        else:
            # Try to find a field that might contain the bioguide ID
            for key in member_info.keys():
                if "bioguide" in key.lower():
                    bioguide_id = member_info[key]
                    logger.info(f"Found bioguide ID under key: {key}")
                    break

        if not bioguide_id:
            logger.error("Could not find bioguide ID in member data")
            return {}

        # Extract name components
        first_name = member_info.get("firstName", "")
        last_name = member_info.get("lastName", "")
        middle_name = member_info.get("middleName", "")
        suffix = member_info.get("suffixName", "")
        nickname = member_info.get("nickName", "")

        # Construct full name
        if "directOrderName" in member_info:
            full_name = member_info["directOrderName"]
        else:
            full_name_parts = [first_name]
            if middle_name:
                full_name_parts.append(middle_name)
            full_name_parts.append(last_name)
            if suffix:
                full_name_parts.append(suffix)
            full_name = " ".join(full_name_parts)

        # Get party from terms array (most recent term first)
        party = Party.OTHER  # Default to OTHER

        party_history = member_info.get("partyHistory", [])
        most_recent_party = party_history[0]
        party_name = most_recent_party.get("partyName")
        if party_name.upper() in ["DEMOCRATIC", "DEMOCRAT", "D"]:
            party = Party.DEMOCRAT
        elif party_name.upper() in ["REPUBLICAN", "R"]:
            party = Party.REPUBLICAN
        elif party_name.upper() in ["INDEPENDENT", "I"]:
            party = Party.INDEPENDENT
        elif party_name.upper() in ["LIBERTARIAN", "L"]:
            party = Party.LIBERTARIAN
        elif party_name.upper() in ["GREEN", "G"]:
            party = Party.GREEN
        else:
            party = Party.OTHER
            logger.warning(f"Unknown party: {party_name}")

        # Get chamber
        chamber = Chamber.HOUSE  # Default to House
        if (
            "terms" in member_info
            and isinstance(member_info["terms"], list)
            and member_info["terms"]
        ):
            most_recent_term = member_info["terms"][-1]
            if isinstance(most_recent_term, dict) and "chamber" in most_recent_term:
                chamber_name = most_recent_term["chamber"]
                if chamber_name.upper() == "SENATE":
                    chamber = Chamber.SENATE

        # Get leadership role
        leadership_role = None
        if "leadership" in member_info and isinstance(member_info["leadership"], list):
            # Find current leadership positions
            current_positions = [
                position["type"]
                for position in member_info["leadership"]
                if isinstance(position, dict) and position.get("current") == True
            ]
            if current_positions:
                leadership_role = ", ".join(current_positions)

        # Get contact information
        website = member_info.get("officialUrl", "")

        office = ""
        phone = ""
        if "addressInformation" in member_info and isinstance(
            member_info["addressInformation"], dict
        ):
            address_info = member_info["addressInformation"]
            office = address_info.get("officeAddress", "")
            phone = address_info.get("phoneNumber", "")

        # Get social media
        twitter_account = ""
        facebook_account = ""
        youtube_account = ""

        # Get state and district
        state = ""
        district = ""

        if (
            "terms" in member_info
            and isinstance(member_info["terms"], list)
            and member_info["terms"]
        ):
            most_recent_term = member_info["terms"][-1]
            if isinstance(most_recent_term, dict):
                state = most_recent_term.get("stateName", member_info.get("state", ""))
                district = str(most_recent_term.get("district", ""))
        else:
            state = member_info.get("state", "")
            district = str(member_info.get("district", ""))

        # Construct member data
        member_data = {
            "bioguide_id": bioguide_id,
            "first_name": first_name,
            "last_name": last_name,
            "middle_name": middle_name,
            "suffix": suffix,
            "nickname": nickname,
            "full_name": full_name,
            "party": party,
            "chamber": chamber,
            "leadership_role": leadership_role,
            "twitter_account": twitter_account,
            "facebook_account": facebook_account,
            "youtube_account": youtube_account,
            "website": website,
            "office": office,
            "phone": phone,
            "state": state,
            "district": district,
        }

        return member_data
    except Exception as e:
        logger.error(f"Error parsing member data: {e}")
        return {}


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


def fetch_law_detail(congress: int, law_type: str, law_number: str) -> Dict[str, Any]:
    """
    Fetch detailed information for a specific law

    Args:
        congress: Congress number (e.g., 117 for 117th Congress)
        law_type: Type of law ('pub' for public, 'pvt' for private)
        law_number: Law number (e.g., '108')

    Returns:
        Dictionary containing detailed law data
    """
    url = f"{BASE_URL}/law/{congress}/{law_type}/{law_number}"
    params = {"format": "json"}

    try:
        response = requests.get(url, headers=HEADERS, params=params)
        response.raise_for_status()
        response_data = response.json()
        logger.info(f"Law detail response structure: {list(response_data.keys())}")
        return response_data
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching law detail: {e}")
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
                text_version = {
                    "date": item.get("date", ""),
                    "type": item.get("type", ""),
                    "formats": item.get("formats", []),
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


def parse_law_data(law_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse law data from the Congress API

    Args:
        law_data: Law data from the Congress API

    Returns:
        Parsed law data
    """
    try:
        # Extract bill data from the law response
        bill_data = law_data.get("bill", {})

        # Extract law information from the bill data
        laws = bill_data.get("laws", [])
        if not laws:
            logger.warning("No law information found in the bill data")
            return {}

        law_info = laws[0]  # Assuming there's only one law per bill

        # Extract the law number and type
        law_number = law_info.get("number", "")
        law_type_full = law_info.get("type", "")

        # Convert full law type to abbreviated form
        law_type = "pub" if law_type_full == "Public Law" else "pvt"

        # Extract the congress number
        congress = bill_data.get("congress", 0)

        # Create a unique law_id
        law_id = (
            f"{congress}-{law_type}-{law_number.split('-')[1] if '-' in law_number else law_number}"
        )

        # Extract the enacted date from the latest action
        enacted_date = None
        latest_action = bill_data.get("latestAction", {})
        if latest_action and "Became Public Law" in latest_action.get("text", ""):
            enacted_date = latest_action.get("actionDate", "")

        # Extract the bill ID
        bill_type = bill_data.get("type", "").lower()
        bill_number = bill_data.get("number", "")
        bill_id = f"{bill_type}{bill_number}-{congress}"

        # Create the parsed law data
        parsed_law = {
            "congress": congress,
            "law_type": law_type,
            "law_number": law_number,
            "law_id": law_id,
            "title": bill_data.get("title", ""),
            "enacted_date": enacted_date,
            "bill_id": bill_id,
        }

        return parsed_law
    except Exception as e:
        logger.error(f"Error parsing law data: {e}", exc_info=True)
        return {}


def sync_laws(
    db: Session,
    congress: int = 118,
    law_type: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
) -> List[Any]:
    """
    Sync laws from the Congress API to the database

    Args:
        db: Database session
        congress: Congress number (e.g., 118 for 118th Congress)
        law_type: Type of law (e.g., 'pub' for public, 'pvt' for private)
        limit: Number of laws to fetch
        offset: Offset for pagination

    Returns:
        List of synced laws
    """
    from app.models.congress import Bill, Law, LawText

    logger.info(f"Syncing laws for congress {congress}, type {law_type if law_type else 'all'}")

    # Fetch laws from the API
    response_data = fetch_laws(congress, law_type, limit, offset)

    # Check if we have bills that became laws in the response
    if "bills" not in response_data or not response_data["bills"]:
        logger.warning("No laws found in the API response")
        return []

    # Process each bill that became a law
    synced_laws = []
    for bill_item in response_data["bills"]:
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
            bill_detail = fetch_bill_detail(congress, bill_type, int(bill_number))

            # Validate bill detail response
            if not bill_detail or "bill" not in bill_detail:
                logger.warning(f"Invalid bill detail response for {bill_type}{bill_number}")
                continue

            # Create a bill_id directly from the bill information
            bill_id = f"{bill_type}{bill_number}-{congress}"

            # Parse the law data
            law_data = parse_law_data(bill_detail)
            if not law_data:
                logger.warning(f"Could not parse law data for bill {bill_id}")
                continue

            # Check if the bill exists in our database
            bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()

            # If the bill doesn't exist, sync it first
            if not bill:
                logger.info(f"Bill {bill_id} not found in database, syncing it first")
                try:
                    # Extract bill data directly from the bill detail response
                    bill_detail_data = bill_detail.get("bill", {})

                    # Validate required bill fields
                    if not bill_detail_data.get("congress") or not bill_detail_data.get("number"):
                        logger.warning(f"Missing required bill fields for {bill_id}")
                        continue

                    # Extract policy areas if available
                    policy_areas = []
                    if (
                        "policyArea" in bill_detail_data
                        and "name" in bill_detail_data["policyArea"]
                    ):
                        policy_areas = [bill_detail_data["policyArea"]["name"]]

                    # Handle the introduced_date
                    introduced_date = None
                    if "introducedDate" in bill_detail_data:
                        try:
                            # Try standard date format
                            introduced_date = datetime.strptime(
                                bill_detail_data["introducedDate"], "%Y-%m-%d"
                            )
                        except ValueError:
                            logger.warning(
                                f"Could not parse introduced_date: {bill_detail_data.get('introducedDate')}"
                            )

                    # Create a new bill with validated data
                    bill = Bill(
                        congress=congress,
                        bill_id=bill_id,
                        bill_type=bill_type,
                        bill_number=int(bill_number),
                        title=bill_detail_data.get("title", ""),
                        introduced_date=introduced_date,
                        policy_areas=policy_areas,
                    )

                    logger.info(
                        f"Creating new bill: {bill_id}, congress={congress}, type={bill_type}, number={bill_number}"
                    )
                    db.add(bill)
                    db.commit()
                    db.refresh(bill)

                    # Sync sponsors and cosponsors if available
                    if "sponsors" in bill_detail_data:
                        for sponsor_data in bill_detail_data["sponsors"]:
                            # Find or create the congressman
                            bioguide_id = sponsor_data.get("bioguideId")
                            if bioguide_id:
                                congressman = (
                                    db.query(Congressman)
                                    .filter(Congressman.bioguide_id == bioguide_id)
                                    .first()
                                )
                                if congressman:
                                    bill.sponsors.append(congressman)

                    # Commit after adding sponsors
                    db.commit()

                    # Sync cosponsors if available
                    if "cosponsors" in bill_detail_data and "url" in bill_detail_data["cosponsors"]:
                        cosponsors_url = bill_detail_data["cosponsors"]["url"]
                        cosponsor_data_list = fetch_bill_cosponsors(cosponsors_url)

                        for cosponsor_data in cosponsor_data_list:
                            bioguide_id = cosponsor_data.get("bioguide_id")
                            if bioguide_id:
                                congressman = (
                                    db.query(Congressman)
                                    .filter(Congressman.bioguide_id == bioguide_id)
                                    .first()
                                )
                                if congressman:
                                    bill.cosponsors.append(congressman)

                    # Commit after adding cosponsors
                    db.commit()

                    # Sync text versions if available
                    if (
                        "textVersions" in bill_detail_data
                        and "url" in bill_detail_data["textVersions"]
                    ):
                        text_versions_url = bill_detail_data["textVersions"]["url"]
                        text_versions = fetch_bill_texts(text_versions_url)

                        for text_version in text_versions:
                            # Extract text URLs
                            formats = text_version.get("formats", [])
                            pdf_url = None
                            formatted_text_url = None

                            for fmt in formats:
                                if fmt.get("type") == "PDF":
                                    pdf_url = fmt.get("url")
                                elif fmt.get("type") == "HTML":
                                    formatted_text_url = fmt.get("url")

                            # Parse the date
                            version_date = None
                            date_str = text_version.get("date")
                            if date_str:
                                # Check if date_str is already a datetime or date object
                                if isinstance(date_str, (datetime, date)):
                                    version_date = date_str
                                else:
                                    try:
                                        # Try standard date format
                                        version_date = datetime.strptime(date_str, "%Y-%m-%d")
                                    except ValueError:
                                        try:
                                            # Try date with time format
                                            version_date = datetime.strptime(
                                                date_str, "%Y-%m-%dT%H:%M:%SZ"
                                            )
                                        except ValueError:
                                            try:
                                                # Just use the date part
                                                version_date = datetime.strptime(
                                                    date_str.split("T")[0], "%Y-%m-%d"
                                                )
                                            except (ValueError, TypeError, AttributeError):
                                                logger.warning(f"Could not parse date: {date_str}")

                            # Create text version
                            bill_text = BillText(
                                formatted_bill_id=bill.bill_id,
                                type=text_version.get("type", ""),
                                date=version_date,
                                pdf_url=pdf_url,
                                formatted_text_url=formatted_text_url,
                            )
                            db.add(bill_text)

                    # Final commit for text versions
                    db.commit()
                    logger.info(f"Successfully synced bill {bill.bill_id}")

                except Exception as e:
                    logger.error(f"Error syncing bill {bill_id}: {e}", exc_info=True)
                    db.rollback()
                    continue  # Skip this law if we couldn't sync the bill

            # Verify the bill exists after sync attempt
            bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
            if not bill:
                logger.error(f"Failed to sync bill {bill_id}, skipping law")
                continue

            # Check if the law already exists in the database
            law_id = law_data["law_id"]
            existing_law = db.query(Law).filter(Law.law_id == law_id).first()

            if existing_law:
                logger.info(f"Law {law_id} already exists, updating")

                # Update the existing law
                for key, value in law_data.items():
                    if (
                        key != "law_id" and key != "bill_id"
                    ):  # Don't update the primary key or bill_id
                        setattr(existing_law, key, value)

                law = existing_law
            else:
                logger.info(f"Creating new law {law_id}")

                # Convert enacted_date string to datetime
                enacted_date = None
                if law_data["enacted_date"]:
                    # Check if enacted_date is already a datetime or date object
                    if isinstance(law_data["enacted_date"], (datetime, date)):
                        enacted_date = law_data["enacted_date"]
                    else:
                        try:
                            enacted_date = datetime.strptime(law_data["enacted_date"], "%Y-%m-%d")
                        except (ValueError, TypeError):
                            logger.warning(
                                f"Could not parse enacted_date: {law_data['enacted_date']}"
                            )

                # Create a new law with the correct bill_id
                law = Law(
                    congress=law_data["congress"],
                    law_type=law_data["law_type"],
                    law_number=law_data["law_number"],
                    law_id=law_id,
                    title=law_data["title"],
                    enacted_date=enacted_date,
                    bill_id=bill.bill_id,  # Use the bill_id from the bill object
                )
                db.add(law)

            # Commit to get the law ID
            db.commit()
            db.refresh(law)

            # Fetch text versions for the law
            if (
                "textVersions" in bill_detail.get("bill", {})
                and "url" in bill_detail["bill"]["textVersions"]
            ):
                text_versions_url = bill_detail["bill"]["textVersions"]["url"]
                text_versions = fetch_law_text_versions(text_versions_url)

                for text_version in text_versions:
                    # Extract version information
                    version_date = None
                    date_str = text_version.get("date")
                    if date_str:
                        # Check if date_str is already a datetime or date object
                        if isinstance(date_str, (datetime, date)):
                            version_date = date_str
                        else:
                            try:
                                # Try standard date format
                                version_date = datetime.strptime(date_str, "%Y-%m-%d")
                            except ValueError:
                                try:
                                    # Try date with time format
                                    version_date = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%SZ")
                                except ValueError:
                                    try:
                                        # Just use the date part
                                        version_date = datetime.strptime(
                                            date_str.split("T")[0], "%Y-%m-%d"
                                        )
                                    except (ValueError, TypeError, AttributeError):
                                        logger.warning(f"Could not parse date: {date_str}")

                    # Extract URLs for different formats
                    pdf_url = None
                    html_url = None
                    xml_url = None

                    for fmt in text_version.get("formats", []):
                        if fmt.get("type") == "PDF":
                            pdf_url = fmt.get("url")
                        elif fmt.get("type") == "HTML":
                            html_url = fmt.get("url")
                        elif fmt.get("type") == "XML":
                            xml_url = fmt.get("url")

                    # Create a version code from the type
                    version_code = text_version.get("type", "").lower().replace(" ", "_")

                    # Check if this text version already exists
                    existing_text = (
                        db.query(LawText)
                        .filter(LawText.law_id == law.law_id, LawText.version_code == version_code)
                        .first()
                    )

                    if existing_text:
                        logger.info(
                            f"Text version {version_code} for law {law.law_id} already exists, updating"
                        )

                        # Update the existing text version
                        existing_text.date = version_date
                        existing_text.version_name = text_version.get("type", "")
                        existing_text.pdf_url = pdf_url
                        existing_text.html_url = html_url
                        existing_text.xml_url = xml_url
                    else:
                        logger.info(
                            f"Creating new text version {version_code} for law {law.law_id}"
                        )

                        # Create a new text version
                        law_text = LawText(
                            law_id=law.law_id,
                            version_code=version_code,
                            version_name=text_version.get("type", ""),
                            date=version_date,
                            pdf_url=pdf_url,
                            html_url=html_url,
                            xml_url=xml_url,
                        )
                        db.add(law_text)

                # Commit the text versions
                db.commit()

            synced_laws.append(law)

        except Exception as e:
            logger.error(
                f"Error syncing law from bill {bill_item.get('number')}: {e}", exc_info=True
            )
            db.rollback()

    logger.info(f"Successfully synced {len(synced_laws)} laws")
    return synced_laws
