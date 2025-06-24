#!/usr/bin/env python3
"""
Script to overwrite (delete and recreate) all Bill Actions for each bill in Supabase.
"""
import argparse
import logging
import os
import sys
from typing import Any, Dict, List

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

MAX_API_LIMIT = 250

def fetch_bills_from_supabase(supabase: Client, limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
    """
    Fetch bills from Supabase.
    """
    result = supabase.table("bill").select("id, congress, type, number, bill_unique_id").range(offset, offset + limit - 1).execute()
    return result.data if result.data else []

def fetch_bill_actions(congress: int, bill_type: str, bill_number: int) -> List[Dict[str, Any]]:
    """
    Fetch actions for a specific bill from the Congress API.
    """
    url = f"{BASE_URL}/bill/{congress}/{bill_type.lower()}/{bill_number}/actions"
    params = {"format": "json"}
    try:
        logger.info(f"Fetching bill actions from URL: {url}")
        response = requests.get(url, headers=HEADERS, params=params)
        response.raise_for_status()
        response_data = response.json()
        actions = []
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

def overwrite_bill_actions_for_bill(supabase: Client, bill: Dict[str, Any]):
    bill_id = bill["id"]
    congress = bill["congress"]
    bill_type = bill["type"]
    bill_number = bill["number"]
    logger.info(f"Processing bill {bill['bill_unique_id']} (ID: {bill_id})")
    # Fetch latest actions from Congress API
    actions = fetch_bill_actions(congress, bill_type, bill_number)
    # Delete all existing actions for this bill
    logger.info(f"Deleting existing actions for bill_id {bill_id}")
    supabase.table("bill_action").delete().eq("bill_id", bill_id).execute()
    # Insert new actions
    for action in actions:
        if not action.get("date") or not action.get("text"):
            logger.warning(f"Skipping action with missing date or text for bill_id {bill_id}")
            continue
        bill_action_data = {
            "bill_id": bill_id,
            "date": action.get("date"),
            "text": action.get("text"),
            "type": action.get("type"),
        }
        supabase.table("bill_action").insert(bill_action_data).execute()
        logger.info(f"Inserted action for date {action.get('date')} for bill_id {bill_id}")

def main():
    parser = argparse.ArgumentParser(description="Overwrite all Bill Actions for each bill in Supabase.")
    parser.add_argument("--limit", type=int, default=20, help="Number of bills to process (default: 20, use -1 for all)")
    parser.add_argument("--offset", type=int, default=0, help="Starting offset for pagination (default: 0)")
    args = parser.parse_args()
    # Initialize Supabase client
    try:
        assert SUPABASE_URL is not None
        assert SUPABASE_KEY is not None
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        sys.exit(1)
    try:
        offset = args.offset
        limit = args.limit
        processed = 0
        while True:
            batch_limit = MAX_API_LIMIT if limit == -1 else min(MAX_API_LIMIT, limit - processed)
            bills = fetch_bills_from_supabase(supabase, limit=batch_limit, offset=offset)
            if not bills:
                logger.info("No more bills to process.")
                break
            for bill in bills:
                try:
                    overwrite_bill_actions_for_bill(supabase, bill)
                except Exception as e:
                    logger.error(f"Error processing bill {bill.get('bill_unique_id')}: {e}", exc_info=True)
            processed += len(bills)
            offset += len(bills)
            if limit != -1 and processed >= limit:
                break
    except Exception as e:
        logger.error(f"Error overwriting bill actions: {e}")
        sys.exit(1)
    logger.info("Completed overwriting bill actions for all bills.")

if __name__ == "__main__":
    main() 