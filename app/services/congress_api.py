import os
import requests
from datetime import datetime
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.congress import Bill, Congressman, Party, Chamber, PolicyArea, BillText
from dotenv import load_dotenv

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
    params = {
        "limit": limit,
        "offset": offset,
        "format": "json"
    }

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
    params = {
        "limit": limit,
        "offset": offset,
        "format": "json"
    }

    try:
        response = requests.get(url, headers=HEADERS, params=params)
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
    params = {
        "format": "json"
    }

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
        logger.info(f"Cosponsor response keys: {list(response_data.keys()) if isinstance(response_data, dict) else 'Not a dictionary'}")

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
                    "is_original_cosponsor": item.get("isOriginalCosponsor", False)
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
        logger.info(f"Text response keys: {list(response_data.keys()) if isinstance(response_data, dict) else 'Not a dictionary'}")

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
                    "formatted_text_url": formatted_text_url
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
                "district": str(sponsor.get("district", ""))
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
    if "textVersions" in bill_info and isinstance(bill_info["textVersions"], dict):
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
        "text_versions_url": text_versions_url
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
        for bill_item in bill_list['bills']:
            try:
                # Fetch detailed bill information
                bill_url = bill_item.get("url", "")
                if not bill_url:
                    logger.warning(f"No URL found for bill: {bill_item}")
                    continue

                bill_data = fetch_bill_detail(congress, bill_item.get("type", ""), bill_item.get("number", 0))
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
                        policy_areas=parsed_bill["policy_areas"]
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
                        congressman = db.query(Congressman).filter(Congressman.bioguide_id == bioguide_id).first()

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
                                    district=sponsor_data.get("district", "")
                                )
                                db.add(congressman)
                                db.flush()  # Flush to get the ID
                            else:
                                logger.warning(f"Could not fetch details for congressman: {bioguide_id}")
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
                        congressman = db.query(Congressman).filter(Congressman.bioguide_id == bioguide_id).first()

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
                                    district=cosponsor_data.get("district", "")
                                )
                                db.add(congressman)
                                db.flush()  # Flush to get the ID
                            else:
                                logger.warning(f"Could not fetch details for congressman: {bioguide_id}")
                                continue

                        # Add cosponsor relationship
                        bill.cosponsors.append(congressman)

                # Fetch and add text versions if available
                if "text_versions_url" in parsed_bill and parsed_bill["text_versions_url"]:
                    # We no longer clear existing text versions, instead we'll check if they exist

                    text_versions = fetch_bill_texts(parsed_bill["text_versions_url"])

                    for text_data in text_versions:
                        # Skip if date is None
                        if not text_data.get("date"):
                            logger.warning(f"Skipping text version with no date for bill: {bill.bill_id}")
                            continue

                        # Check if this text version already exists
                        existing_text = db.query(BillText).filter(
                            BillText.bill_id == bill.bill_id,
                            BillText.date == text_data.get("date")
                        ).first()

                        if existing_text:
                            logger.info(f"Text version for date {text_data.get('date')} already exists for bill: {bill.bill_id}")
                            # Optionally update URLs if they've changed
                            if (existing_text.pdf_url != text_data.get("pdf_url") or
                                existing_text.xml_url != text_data.get("xml_url") or
                                existing_text.formatted_text_url != text_data.get("formatted_text_url")):
                                logger.info(f"Updating URLs for existing text version")
                                existing_text.pdf_url = text_data.get("pdf_url")
                                existing_text.xml_url = text_data.get("xml_url")
                                existing_text.formatted_text_url = text_data.get("formatted_text_url")
                            continue

                        # Create new text version if it doesn't exist
                        bill_text = BillText(
                            bill_id=bill.bill_id,
                            type=text_data.get("type", ""),
                            date=text_data.get("date"),
                            pdf_url=text_data.get("pdf_url"),
                            xml_url=text_data.get("xml_url"),
                            formatted_text_url=text_data.get("formatted_text_url")
                        )
                        db.add(bill_text)
                        logger.info(f"Added new text version for date {text_data.get('date')} for bill: {bill.bill_id}")
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
    logger.info(f"Syncing members of Congress with limit: {limit}, offset: {offset}")

    # Fetch members from the API
    response_data = fetch_members(limit=limit, offset=offset)

    # Process each member
    processed_members = []

    # Extract members from the response - the API returns a list under a specific key
    # We need to check the structure of the response
    if "members" in response_data:
        members_list = response_data["members"]
    elif "member" in response_data:
        members_list = response_data["member"]
    else:
        # Try to find the correct key in the response
        # The Congress API might use a different structure than expected
        for key in response_data.keys():
            if isinstance(response_data[key], list):
                logger.info(f"Found members list under key: {key}")
                members_list = response_data[key]
                break
        else:
            # If we can't find a list, log the structure and return empty
            logger.error(f"Could not find members list in response. Keys: {list(response_data.keys())}")
            return []

    logger.info(f"Found {len(members_list)} members to process")

    # Log the structure of the first member item to understand its format
    if members_list and len(members_list) > 0:
        first_member = members_list[0]
        logger.info(f"First member structure: {first_member.keys() if isinstance(first_member, dict) else 'Not a dictionary'}")

    for member_item in members_list:
        try:
            # Check if member_item is a dictionary
            if not isinstance(member_item, dict):
                logger.warning(f"Member item is not a dictionary, skipping: {member_item}")
                continue

            # Get bioguide ID - check different possible field names
            bioguide_id = None
            if "bioguideId" in member_item:
                bioguide_id = member_item["bioguideId"]
            elif "bioguideID" in member_item:
                bioguide_id = member_item["bioguideID"]
            elif "bioguide_id" in member_item:
                bioguide_id = member_item["bioguide_id"]
            else:
                # Try to find a field that might contain the bioguide ID
                for key in member_item.keys():
                    if "bioguide" in key.lower():
                        bioguide_id = member_item[key]
                        logger.info(f"Found bioguide ID under key: {key}")
                        break

            if not bioguide_id:
                logger.error("Could not find bioguide ID in member data")
                return {}

            # Extract name components
            first_name = member_item.get("firstName", "")
            last_name = member_item.get("lastName", "")
            middle_name = member_item.get("middleName", "")
            suffix = member_item.get("suffixName", "")
            nickname = member_item.get("nickName", "")

            # Construct full name
            if "directOrderName" in member_item:
                full_name = member_item["directOrderName"]
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

            party_history = member_item.get("partyHistory", [])
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
            if "terms" in member_item and isinstance(member_item["terms"], list) and member_item["terms"]:
                most_recent_term = member_item["terms"][-1]
                if isinstance(most_recent_term, dict) and "chamber" in most_recent_term:
                    chamber_name = most_recent_term["chamber"]
                    if chamber_name.upper() == "SENATE":
                        chamber = Chamber.SENATE

            # Get leadership role
            leadership_role = None
            if "leadership" in member_item and isinstance(member_item["leadership"], list):
                # Find current leadership positions
                current_positions = [
                    position["type"]
                    for position in member_item["leadership"]
                    if isinstance(position, dict) and position.get("current") == True
                ]
                if current_positions:
                    leadership_role = ", ".join(current_positions)

            # Get contact information
            website = member_item.get("officialUrl", "")

            office = ""
            phone = ""
            if "addressInformation" in member_item and isinstance(member_item["addressInformation"], dict):
                address_info = member_item["addressInformation"]
                office = address_info.get("officeAddress", "")
                phone = address_info.get("phoneNumber", "")

            # Get social media
            twitter_account = ""
            facebook_account = ""
            youtube_account = ""

            # Get state and district
            state = ""
            district = ""

            if "terms" in member_item and isinstance(member_item["terms"], list) and member_item["terms"]:
                most_recent_term = member_item["terms"][-1]
                if isinstance(most_recent_term, dict):
                    state = most_recent_term.get("stateName", member_item.get("state", ""))
                    district = str(most_recent_term.get("district", ""))
            else:
                state = member_item.get("state", "")
                district = str(member_item.get("district", ""))

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
                "district": district
            }

            return member_data
        except Exception as e:
            logger.error(f"Error parsing member data: {e}")
            return {}


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
                logger.error(f"Could not find member data in response. Keys: {list(member_data.keys())}")
                return {}

        # Log the structure of the member info to understand its format
        logger.info(f"Member info structure: {member_info.keys() if isinstance(member_info, dict) else 'Not a dictionary'}")

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
        if "terms" in member_info and isinstance(member_info["terms"], list) and member_info["terms"]:
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
        if "addressInformation" in member_info and isinstance(member_info["addressInformation"], dict):
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

        if "terms" in member_info and isinstance(member_info["terms"], list) and member_info["terms"]:
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
            "district": district
        }

        return member_data
    except Exception as e:
        logger.error(f"Error parsing member data: {e}")
        return {}
