import os
import sys
import logging
from dotenv import load_dotenv
import requests
from datetime import datetime
from supabase import create_client, Client
import argparse

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Load environment variables from .env if present
load_dotenv()

COURT_LISTENER_URL = "https://www.courtlistener.com/api/rest/v4/courts/"
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
COURT_LISTENER_API_KEY = os.getenv("COURT_LISTENER_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("SUPABASE_URL and SUPABASE_KEY environment variables must be set")
    sys.exit(1)

if not COURT_LISTENER_API_KEY:
    logger.error("COURT_LISTENER_API_KEY environment variable must be set")
    sys.exit(1)

API_HEADERS = {
    "Authorization": f"Token {COURT_LISTENER_API_KEY}"
}

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_all_courts(page_limit=20):
    courts = []
    url = COURT_LISTENER_URL
    page_count = 0
    while url and page_count < page_limit:
        resp = requests.get(url, headers=API_HEADERS)
        resp.raise_for_status()
        data = resp.json()
        courts.extend(data["results"])
        url = data.get("next")
        page_count += 1
    return courts

def map_court_to_row(api_court):
    return {
        "remote_id": api_court.get("id"),
        "jurisdiction": api_court.get("jurisdiction"),
        "full_name": api_court.get("full_name"),
        "short_name": api_court.get("short_name"),
        "start_date": api_court.get("start_date"),
        "end_date": api_court.get("end_date"),
    }

def sync_courts(page_limit=20):
    logger.info("Fetching courts from Court Listener API...")
    courts = fetch_all_courts(page_limit=page_limit)
    logger.info(f"Fetched {len(courts)} courts.")

    rows = [map_court_to_row(c) for c in courts]
    logger.info("Upserting courts into Supabase...")
    for row in rows:
        try:
            resp = supabase.table("court").upsert(row, on_conflict=["remote_id"]).execute()
            if resp.data and len(resp.data) > 0:
                logger.info(f"Upserted court {row['remote_id']}")
        except Exception as e:
            logger.error(f"Failed to upsert court {row['remote_id']}: {e}")
    logger.info("Sync complete.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync courts from Court Listener API to Supabase")
    parser.add_argument("--page-limit", type=int, default=20, help="Maximum number of pages to fetch (default: 20)")
    args = parser.parse_args()
    sync_courts(page_limit=args.page_limit)
