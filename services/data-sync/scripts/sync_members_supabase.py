#!/usr/bin/env python3
"""
Script to sync members of Congress from the Congress API to Supabase.
"""
import argparse
import logging
import sys
from typing import Any, Dict, List, Tuple, cast

from dotenv import load_dotenv
from supabase import Client
from sync_common import (
    RunStats,
    build_http_session,
    create_supabase_client,
    get_json,
    require_env,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

BASE_URL = "https://api.congress.gov/v3"

# Maximum limit allowed by the Congress API
MAX_API_LIMIT = 250


# Enum values for Party and Chamber
class Party:
    DEMOCRAT = "Democrat"
    REPUBLICAN = "Republican"
    INDEPENDENT = "Independent"
    LIBERTARIAN = "Libertarian"
    GREEN = "Green"
    OTHER = "Other"


class Chamber:
    HOUSE = "house"
    SENATE = "senate"


def fetch_members(session: Any, limit: int = 100, offset: int = 0) -> Dict[str, Any]:
    """
    Fetch members of Congress from the Congress API

    Args:
        limit: Number of results to return
        offset: Offset for pagination

    Returns:
        Dictionary containing member data
    """
    url = f"{BASE_URL}/member"
    params = {"limit": limit, "offset": offset, "format": "json"}

    response_data = get_json(session, url, params=params)
    logger.info("API response keys: %s", list(response_data.keys()))
    return response_data


def fetch_member_detail(session: Any, bioguide_id: str) -> Dict[str, Any]:
    """
    Fetch detailed information for a specific member of Congress

    Args:
        bioguide_id: Bioguide ID of the member

    Returns:
        Dictionary containing member data
    """
    url = f"{BASE_URL}/member/{bioguide_id}"
    params = {"format": "json"}

    response_data = get_json(session, url, params=params)
    logger.debug("Member detail response keys: %s", list(response_data.keys()))
    return response_data


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
                if (
                    isinstance(member_data[key], dict)
                    and "bioguideId" in member_data[key]
                ):
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
        if party_history and len(party_history) > 0:
            most_recent_party = party_history[0]
            party_name = most_recent_party.get("partyName", "")
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
        office = ""
        phone = ""
        if "addressInformation" in member_info and isinstance(
            member_info["addressInformation"], dict
        ):
            address_info = member_info["addressInformation"]
            office = address_info.get("officeAddress", "")
            phone = address_info.get("phoneNumber", "")

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
            "full_name": full_name,
            "party": party,
            "chamber": chamber,
            "leadership_role": leadership_role,
            "office": office,
            "phone": phone,
            "state": state,
            "district": district,
        }

        return member_data
    except Exception as e:
        logger.error(f"Error parsing member data: {e}")
        return {}


def extract_terms(
    member_detail: Dict[str, Any], congressman_id: int
) -> List[Dict[str, Any]]:
    """
    Extract terms from member detail data

    Args:
        member_detail: Member detail data from the API
        congressman_id: ID of the congressman in the database

    Returns:
        List of term data dictionaries
    """
    terms = []

    if "terms" in member_detail.get("member", {}) and isinstance(
        member_detail["member"]["terms"], list
    ):
        for term_data in member_detail["member"]["terms"]:
            # Extract term information
            congress = term_data.get("congress")
            chamber_name = term_data.get("chamber")
            start_year = term_data.get("startYear")
            end_year = term_data.get("endYear")
            state_code = term_data.get("stateCode")
            state_name = term_data.get("stateName")
            district = term_data.get("district")

            # Skip if missing required fields
            if not congress or not chamber_name or not start_year:
                logger.warning(
                    f"Term missing required fields for member {congressman_id}, skipping term"
                )
                continue

            # Map chamber name to enum
            chamber = Chamber.HOUSE
            if chamber_name.upper() == "SENATE":
                chamber = Chamber.SENATE

            # Create term record
            term = {
                "congressman_id": congressman_id,
                "congress": congress,
                "chamber": chamber,
                "start_year": start_year,
                "end_year": end_year,
                "state": state_name or "",
                "district": str(district) if district else None,
            }

            terms.append(term)

    return terms


def sync_members_to_supabase(
    supabase: Client, session: Any, limit: int = 100, offset: int = 0
) -> Tuple[List[Dict[str, Any]], int, int]:
    """
    Sync members from the Congress API to Supabase

    Args:
        supabase: Supabase client
        limit: Number of members to fetch
        offset: Offset for pagination

    Returns:
        List of dictionaries representing members that were created or updated
    """
    logger.info(f"Syncing up to {limit} members starting from offset {offset}")

    # Fetch members from the API
    response_data = fetch_members(session, limit, offset)

    # Check if we have members in the response
    if "members" not in response_data or not response_data["members"]:
        logger.warning("No members found in the API response")
        return [], 0, 0

    # Process each member
    synced_members = []
    failed_count = 0
    for member_item in response_data["members"]:
        try:
            # Get the bioguide ID
            bioguide_id = member_item.get("bioguideId")
            if not bioguide_id:
                failed_count += 1
                logger.warning("Member missing bioguide ID, skipping")
                continue

            # Fetch detailed information about the member
            member_detail = fetch_member_detail(session, bioguide_id)

            # Parse the member data
            member_data = parse_member_data(member_detail)
            if not member_data:
                failed_count += 1
                logger.warning(
                    f"Could not parse data for member {bioguide_id}, skipping"
                )
                continue

            result = (
                supabase.table("congressman")
                .upsert(member_data, on_conflict="bioguide_id")
                .execute()
            )
            rows = cast(List[Dict[str, Any]], result.data or [])
            congressman_id = rows[0]["id"] if rows else None
            if not congressman_id:
                raise RuntimeError(f"Upsert returned no ID for member {bioguide_id}")

            # Process terms if available in the member detail
            terms = extract_terms(member_detail, congressman_id)
            supabase.rpc(
                "replace_congressman_terms",
                {"p_congressman_id": congressman_id, "p_terms": terms},
            ).execute()

            # Add the member to the synced list
            synced_members.append(member_data)

        except Exception as e:
            failed_count += 1
            logger.error(f"Error syncing member {member_item.get('bioguideId')}: {e}")

    logger.info(f"Successfully synced {len(synced_members)} members")
    return synced_members, len(response_data["members"]), failed_count


def main() -> int:
    """Main function to run the member sync process."""
    parser = argparse.ArgumentParser(
        description="Sync members from the Congress API to Supabase"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Total number of members to sync (default: 100, use -1 for all available)",
    )
    parser.add_argument(
        "--offset",
        type=int,
        default=0,
        help="Starting offset for pagination (default: 0)",
    )
    parser.add_argument(
        "--max-batches",
        type=int,
        default=10,
        help="Maximum number of batches to sync when using limit=-1 (default: 10)",
    )
    args = parser.parse_args()

    load_dotenv()
    try:
        api_key = require_env("CONGRESS_API_KEY")
        supabase = create_supabase_client()
    except Exception as e:
        logger.error(f"Failed to initialize clients: {e}")
        return 2
    session = build_http_session(headers={"X-API-Key": api_key})
    stats = RunStats()

    try:
        total_members = 0
        current_offset = args.offset

        # Calculate number of batches needed
        if args.limit == -1:
            # If limit is -1, sync all available members up to max_batches
            remaining_limit = args.max_batches * MAX_API_LIMIT
            logger.info(
                f"Syncing all available members up to {args.max_batches} batches"
            )
        else:
            remaining_limit = args.limit
            logger.info(f"Syncing up to {remaining_limit} members")

        batch_num = 1

        # Continue until we've synced all requested members or reached the end of available data
        while remaining_limit > 0 or args.limit == -1:
            # Calculate the batch size (respecting the API's max limit)
            batch_size = (
                min(MAX_API_LIMIT, remaining_limit)
                if args.limit != -1
                else MAX_API_LIMIT
            )

            logger.info(
                f"Starting batch {batch_num} with offset {current_offset}, batch size {batch_size}"
            )

            # Sync members for this batch
            members, fetched_count, failed_count = sync_members_to_supabase(
                supabase, session, limit=batch_size, offset=current_offset
            )
            batch_count = len(members)
            total_members += batch_count
            stats.fetched += fetched_count
            stats.written += batch_count
            stats.failed += failed_count

            logger.info(f"Batch {batch_num} completed: synced {batch_count} members")

            # If we received fewer members than requested, we've reached the end
            if fetched_count < batch_size:
                logger.info(
                    f"Reached end of available members at offset {current_offset}"
                )
                break

            # Update offset for next batch
            current_offset += fetched_count

            # Update remaining limit
            if args.limit != -1:
                remaining_limit -= fetched_count

            # Check if we've reached the maximum number of batches
            if args.limit == -1 and batch_num >= args.max_batches:
                logger.info(f"Reached maximum number of batches ({args.max_batches})")
                break

            batch_num += 1

        logger.info(f"Successfully synced {total_members} members in total")
    except Exception as e:
        logger.error(f"Error syncing members: {e}")
        stats.failed += 1

    stats.log("members")
    return 1 if stats.failed else 0


if __name__ == "__main__":
    sys.exit(main())
