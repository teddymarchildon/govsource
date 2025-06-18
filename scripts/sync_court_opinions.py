#!/usr/bin/env python3
"""
Script to sync court opinions from Court Listener API to Supabase.

This script:
1. Queries the Court Listener API for clusters
2. For each cluster:
   a. Creates/updates cluster record
   b. Gets associated opinions
   c. For each opinion:
      - Gets detailed information
      - Gets author information and adds to judge table if needed
      - Creates a new entry in the court_opinion table
      - Downloads and stores PDF and HTML content
"""
import argparse
import logging
import os
import sys
import time
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple

import requests
from dotenv import load_dotenv
from supabase import Client, create_client

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
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

# Court Listener API configuration
COURT_LISTENER_API_KEY = os.getenv("COURT_LISTENER_API_KEY")
if not COURT_LISTENER_API_KEY:
    logger.error("COURT_LISTENER_API_KEY environment variable must be set")
    sys.exit(1)

COURT_LISTENER_BASE_URL = "https://www.courtlistener.com/api/rest/v4"
API_HEADERS = {
    "Authorization": f"Token {COURT_LISTENER_API_KEY}"
}

# Rate limiting parameters - be conservative to respect the API
RATE_LIMIT_DELAY_SECONDS = 1.0  # 1 second between requests

def fetch_clusters(
    court_id: str = 'scotus',
    max_pages: Optional[int] = None
) -> List[Dict]:
    """
    Fetch clusters from Court Listener API with rate limiting.

    Args:
        court_id: Court identifier (e.g., 'scotus' for Supreme Court)
        max_pages: Maximum number of pages to process

    Returns:
        List of cluster data
    """
    clusters = []
    url = f"{COURT_LISTENER_BASE_URL}/clusters/?docket__court={court_id}&order_by=-date_filed"

    page_count = 0

    while url and (max_pages is None or page_count < max_pages):
        try:
            logger.info(f"Fetching clusters page {page_count + 1} from {url}")

            response = requests.get(url, headers=API_HEADERS)
            response.raise_for_status()

            data = response.json()
            results = data.get('results', [])
            clusters.extend(results)

            logger.info(f"Fetched {len(results)} clusters (total: {len(clusters)})")

            # Get next page URL
            url = data.get('next')

            page_count += 1

        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching clusters: {e}")
            break

    return clusters

def get_cluster_detail(cluster_id: int) -> Dict:
    """
    Fetch detailed information about a cluster.

    Args:
        cluster_id: Court Listener cluster ID

    Returns:
        Cluster detail dictionary
    """
    try:
        url = f"{COURT_LISTENER_BASE_URL}/clusters/{cluster_id}/"
        response = requests.get(url, headers=API_HEADERS)
        response.raise_for_status()

        return response.json()
    except Exception as e:
        logger.error(f"Error fetching cluster detail for {cluster_id}: {e}")
        return {}

def get_or_create_cluster(
    supabase: Client,
    cluster_data: Dict,
    court_remote_id: str = 'scotus',
) -> Optional[int]:
    """
    Get an existing cluster or create a new one if not found.

    Args:
        supabase: Supabase client
        cluster_data: Cluster data from Court Listener API
        court_remote_id: Court Listener court ID (e.g., 'scotus')

    Returns:
        Cluster ID in Supabase or None if not found/created
    """
    remote_id = str(cluster_data.get('id'))
    if not remote_id:
        logger.warning("No remote_id found in cluster data")
        return None

    # Try to find the cluster by remote_id
    try:
        result = supabase.table('cluster').select('id').eq('remote_id', remote_id).execute()
        if result.data and len(result.data) > 0:
            cluster_id = result.data[0]['id']
            logger.info(f"Found existing cluster with ID {cluster_id}")

            # Update the existing cluster with date_filed and judges
            update_data = {}
            if 'date_filed' in cluster_data:
                update_data['date_filed'] = cluster_data.get('date_filed')

            # Add judges field to update data if it exists
            if 'judges' in cluster_data:
                update_data['judges'] = cluster_data.get('judges')

            if update_data:
                logger.info(f"Updating cluster {cluster_id} with: {update_data}")
                supabase.table('cluster').update(update_data).eq('id', cluster_id).execute()

            return cluster_id

        # Get the court ID from the remote_id
        court_id = get_court_id_by_remote_id(supabase, court_remote_id)
        if not court_id:
            logger.error(f"Could not find court with remote_id {court_remote_id}")
            return None

        # Create a new cluster
        cluster_insert = {
            'remote_id': remote_id,
            'court_id': court_id,
            'slug': cluster_data.get('slug', ''),
            'case_name': cluster_data.get('case_name', ''),
            'case_name_short': cluster_data.get('case_name_short', ''),
            'date_filed': cluster_data.get('date_filed', None),
            'judges': cluster_data.get('judges', None)
        }

        result = supabase.table('cluster').insert(cluster_insert).execute()
        if result.data and len(result.data) > 0:
            cluster_id = result.data[0]['id']
            logger.info(f"Created new cluster with ID {cluster_id}")
            return cluster_id

    except Exception as e:
        logger.error(f"Error creating new cluster: {e}")

    return None

def fetch_opinions(
    opinion_urls: List[str]
) -> List[Dict]:
    """
    Fetch opinions from Court Listener API with rate limiting.

    Args:
        opinion_urls: List of opinion URLs to fetch

    Returns:
        List of opinion data
    """
    opinions = []

    for url in opinion_urls:
        try:
            # Extract opinion ID from URL
            opinion_id = url.rstrip('/').split('/')[-1]

            # Construct full API URL
            api_url = f"{COURT_LISTENER_BASE_URL}/opinions/{opinion_id}/"

            logger.info(f"Fetching opinion from {api_url}")
            response = requests.get(api_url, headers=API_HEADERS)
            response.raise_for_status()

            opinion_data = response.json()
            opinions.append(opinion_data)

            logger.info(f"Fetched opinion {opinion_id}")

        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching opinion from {url}: {e}")
            continue

    return opinions

def get_opinion_detail(opinion_id: int) -> Dict:
    """
    Fetch detailed information about an opinion.

    Args:
        opinion_id: Court Listener opinion ID

    Returns:
        Opinion detail dictionary
    """
    try:
        url = f"{COURT_LISTENER_BASE_URL}/opinions/{opinion_id}/"
        response = requests.get(url, headers=API_HEADERS)
        response.raise_for_status()

        return response.json()
    except Exception as e:
        logger.error(f"Error fetching opinion detail for {opinion_id}: {e}")
        return {}

def get_judge_detail(judge_id: int) -> Dict:
    """
    Fetch detailed information about a judge/author.

    Args:
        judge_id: Court Listener person ID

    Returns:
        Judge detail dictionary
    """
    try:
        print(f"Fetching judge detail for {judge_id}")
        # Add delay to respect rate limits

        url = f"{COURT_LISTENER_BASE_URL}/people/{judge_id}/"
        response = requests.get(url, headers=API_HEADERS)
        response.raise_for_status()

        return response.json()
    except Exception as e:
        logger.error(f"Error fetching judge detail for {judge_id}: {e}")
        return {}

def download_and_upload_content(
    supabase: Client,
    opinion: Dict,
    storage_bucket: str
) -> Dict[str, str]:
    """
    Download PDF and HTML content and upload to Supabase storage.

    Args:
        supabase: Supabase client
        opinion: Opinion data dictionary
        storage_bucket: Supabase storage bucket name

    Returns:
        Dictionary with file paths (pdf_file_path, html_file_path, text_file_path)
    """
    file_paths = {}

    # Create a consistent path structure for all files
    opinion_id = str(opinion.get('id', ''))
    date_str = opinion.get('date_created', '').split('T')[0]  # Extract YYYY-MM-DD

    if not opinion_id or not date_str:
        logger.error("Missing opinion ID or date, cannot create file paths")
        return file_paths

    # Create path structure: opinions/YYYY/MM/DD/opinion_id
    year, month, day = date_str.split('-')
    base_path = f"opinions/{year}/{month}/{day}/{opinion_id}"

    # Handle PDF
    pdf_url = opinion.get('download_url')
    if pdf_url:
        try:
            pdf_path = f"{base_path}.pdf"
            logger.info(f"Downloading PDF from {pdf_url}")
            response = requests.get(pdf_url)
            response.raise_for_status()

            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_file:
                temp_file.write(response.content)
                temp_file_path = temp_file.name

            logger.info(f"Uploading PDF to storage bucket '{storage_bucket}' at path '{pdf_path}'")
            with open(temp_file_path, 'rb') as f:
                supabase.storage.from_(storage_bucket).upload(
                    pdf_path,
                    f,
                    {"content-type": "application/pdf"}
                )
            file_paths['pdf_file_path'] = pdf_path
            os.unlink(temp_file_path)  # Clean up temp file
        except Exception as e:
            logger.error(f"Error downloading/uploading PDF: {e}")
            file_paths['pdf_file_path'] = pdf_path

    # Handle HTML
    html_content = opinion.get('html_with_citations')
    if html_content:
        try:
            html_path = f"{base_path}.html"
            logger.info(f"Uploading HTML to storage bucket '{storage_bucket}' at path '{html_path}'")
            supabase.storage.from_(storage_bucket).upload(
                html_path,
                html_content.encode('utf-8'),
                {"content-type": "text/html"}
            )
            file_paths['html_file_path'] = html_path
        except Exception as e:
            logger.error(f"Error uploading HTML content: {e}")
            file_paths['html_file_path'] = html_path

    # Handle plain text
    plain_text = opinion.get('plain_text')
    if plain_text:
        try:
            text_path = f"{base_path}.txt"
            logger.info(f"Uploading text to storage bucket '{storage_bucket}' at path '{text_path}'")
            supabase.storage.from_(storage_bucket).upload(
                text_path,
                plain_text.encode('utf-8'),
                {"content-type": "text/plain"}
            )
            file_paths['text_file_path'] = text_path
        except Exception as e:
            logger.error(f"Error uploading text content: {e}")
            file_paths['text_file_path'] = text_path

    return file_paths

def get_or_create_judge(
    supabase: Client,
    judge_data: Dict,
) -> Optional[int]:
    """
    Get an existing judge or create a new one if not found.

    Args:
        supabase: Supabase client
        judge_data: Judge data from Court Listener API

    Returns:
        Judge ID in Supabase or None if not found/created
    """
    # Get the judge's remote ID from the Court Listener API
    remote_id = str(judge_data.get('id'))
    if remote_id:
        # Try to find the judge by remote_id first
        try:
            result = supabase.table('judge').select('id').eq('remote_id', remote_id).execute()
            if result.data and len(result.data) > 0:
                judge_id = result.data[0]['id']
                logger.info(f"Found existing judge with ID {judge_id} by remote_id {remote_id}")
                return judge_id
        except Exception as e:
            logger.error(f"Error checking for existing judge by remote_id: {e}")

    # If no remote_id or not found by remote_id, check by name
    judge_name = f"{judge_data.get('name_first', '')} {judge_data.get('name_middle', '')} {judge_data.get('name_last', '')}".strip()

    if not judge_name:
        logger.warning("No judge name found in data")
        return None

    # Try to find the judge by full name
    judge_id = None
    try:
        result = supabase.table('judge').select('id').eq('full_name', judge_name).execute()
        if result.data and len(result.data) > 0:
            judge_id = result.data[0]['id']
            logger.info(f"Found existing judge with ID {judge_id} by name")
            return judge_id
    except Exception as e:
        logger.error(f"Error checking for existing judge by name: {e}")
        return None

    # Judge not found, create a new one
    try:
        logger.info(f"Creating new judge: {judge_name} with remote_id {remote_id}")

        judge_data_insert = {
            'first_name': judge_data.get('name_first', ''),
            'middle_name': judge_data.get('name_middle', ''),
            'last_name': judge_data.get('name_last', ''),
            'suffix': judge_data.get('name_suffix', ''),
            'full_name': judge_name,
            'remote_id': remote_id
        }

        result = supabase.table('judge').insert(judge_data_insert).execute()
        if result.data and len(result.data) > 0:
            judge_id = result.data[0]['id']
            logger.info(f"Created new judge with ID {judge_id}")
            return judge_id

    except Exception as e:
        logger.error(f"Error creating new judge: {e}")

    return None

def get_court_id_by_remote_id(supabase: Client, remote_id: str) -> Optional[int]:
    """
    Get the Supabase court ID by its remote_id from Court Listener.

    Args:
        supabase: Supabase client
        remote_id: Court Listener court ID (e.g., 'scotus')

    Returns:
        Supabase court ID or None if not found
    """
    try:
        result = supabase.table('court').select('id').eq('remote_id', remote_id).execute()
        if result.data and len(result.data) > 0:
            court_id = result.data[0]['id']
            logger.info(f"Found court with ID {court_id} for remote_id {remote_id}")
            return court_id
        else:
            logger.warning(f"No court found with remote_id {remote_id}")
            return None
    except Exception as e:
        logger.error(f"Error finding court by remote_id {remote_id}: {e}")
        return None

def check_opinion_exists(
    supabase: Client,
    remote_id: str,
    cluster_id: int,
    author_id: Optional[int],
    date: str
) -> Optional[int]:
    """
    Check if an opinion already exists with the given criteria.

    Args:
        supabase: Supabase client
        remote_id: Court Listener opinion ID
        cluster_id: Cluster ID in Supabase
        author_id: Judge ID in Supabase (optional)
        date: Opinion date

    Returns:
        Opinion ID in Supabase if it exists, None otherwise
    """
    try:
        # First try to find by remote_id as it's the most reliable
        result = supabase.table('court_opinion').select('id').eq('remote_id', remote_id).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]['id']

        # If not found by remote_id, check combination of cluster, author, and date
        query = supabase.table('court_opinion').select('id').eq('cluster_id', cluster_id).eq('date', date)

        if author_id:
            query = query.eq('author_id', author_id)

        result = query.execute()
        if result.data and len(result.data) > 0:
            return result.data[0]['id']

        return None

    except Exception as e:
        logger.error(f"Error checking for existing opinion: {e}")
        return None

def sync_opinions_to_supabase(
    supabase: Client,
    court_remote_id: str = 'scotus',
    max_pages: Optional[int] = None,
    skip_storage: bool = False
) -> List[Dict[str, Any]]:
    """
    Sync opinions from Court Listener API to Supabase.

    Args:
        supabase: Supabase client
        court_remote_id: Court Listener court ID (e.g., 'scotus')
        max_pages: Maximum number of pages to process
        skip_storage: Skip downloading and uploading documents to storage

    Returns:
        List of synced opinions
    """
    synced_opinions = []

    # Fetch clusters first
    clusters = fetch_clusters(court_id=court_remote_id, max_pages=max_pages)
    logger.info(f"Fetched {len(clusters)} clusters")

    for cluster in clusters:
        cluster_id = cluster.get('id')
        if not cluster_id:
            logger.warning("Cluster missing ID, skipping")
            continue

        # Get detailed cluster information
        cluster_detail = get_cluster_detail(cluster_id)
        if not cluster_detail:
            logger.warning(f"Could not get detail for cluster {cluster_id}, skipping")
            continue

        # Get or create cluster in Supabase
        cluster_id_db = get_or_create_cluster(supabase, cluster_detail, court_remote_id=court_remote_id)
        if not cluster_id_db:
            logger.warning(f"Could not create/get cluster {cluster_id}, skipping")
            continue

        # Get opinions for this cluster
        opinion_urls = cluster.get('sub_opinions', [])
        if not opinion_urls:
            logger.info(f"No opinions found for cluster {cluster_id}, skipping")
            continue

        # Fetch opinions
        opinions = fetch_opinions(opinion_urls)
        logger.info(f"Fetched {len(opinions)} opinions for cluster {cluster_id}")

        for opinion in opinions:
            opinion_id = opinion.get('id')
            if not opinion_id:
                logger.warning("Opinion missing ID, skipping")
                continue

            # Get author (judge) information
            judge_id = None
            author_url = opinion.get('author')
            if author_url:
                try:
                    # Extract judge ID from URL
                    judge_id_str = author_url.rstrip('/').split('/')[-1]
                    judge_data = get_judge_detail(int(judge_id_str))
                    if judge_data:
                        judge_id = get_or_create_judge(supabase, judge_data)
                except Exception as e:
                    logger.error(f"Error processing author {author_url}: {e}")

            # Get joined_by judges
            joined_by_urls = opinion.get('joined_by', [])
            joined_by_ids = []
            for joined_url in joined_by_urls:
                try:
                    # Extract judge ID from URL
                    joined_judge_id = joined_url.rstrip('/').split('/')[-1]
                    judge_data = get_judge_detail(int(joined_judge_id))
                    if judge_data:
                        db_judge_id = get_or_create_judge(supabase, judge_data)
                        if db_judge_id:
                            joined_by_ids.append(db_judge_id)
                except Exception as e:
                    logger.error(f"Error processing joined_by judge {joined_url}: {e}")

            # Download and upload content
            file_paths = {}
            if not skip_storage:
                file_paths = download_and_upload_content(
                    supabase,
                    opinion,
                    'opinions'  # Storage bucket name
                )

            # Create opinion record in Supabase
            try:
                # Check if opinion already exists
                opinion_date = opinion.get('date_created', '').split('T')[0]
                opinion_id_db = check_opinion_exists(
                    supabase,
                    str(opinion_id),
                    cluster_id_db,
                    judge_id,
                    opinion_date
                )

                court_opinion_data = {
                    'remote_id': str(opinion_id),
                    'date': opinion_date,
                    'author_id': judge_id,
                    'cluster_id': cluster_id_db,
                    'type': opinion.get('type', ''),
                    'joined_by': joined_by_ids if joined_by_ids else None,
                    'pdf_file_path': file_paths.get('pdf_file_path', ''),
                    'html_file_path': file_paths.get('html_file_path', ''),
                    'text_file_path': file_paths.get('text_file_path', '')
                }

                # Remove None values
                court_opinion_data = {k: v for k, v in court_opinion_data.items() if v is not None}

                if opinion_id_db:
                    # Update existing opinion
                    logger.info(f"Updating existing court opinion with ID {opinion_id_db}")
                    result = supabase.table('court_opinion').update(court_opinion_data).eq('id', opinion_id_db).execute()
                    if result.data and len(result.data) > 0:
                        logger.info(f"Updated court opinion with ID {opinion_id_db}")
                        synced_opinions.append(result.data[0])
                else:
                    # Create new opinion
                    logger.info(f"Creating new court opinion record for opinion {opinion_id}")
                    result = supabase.table('court_opinion').insert(court_opinion_data).execute()
                    if result.data and len(result.data) > 0:
                        logger.info(f"Created court opinion with ID {result.data[0]['id']}")
                        synced_opinions.append(result.data[0])
            except Exception as e:
                logger.error(f"Error creating court opinion record: {e}")

    return synced_opinions

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description='Sync court opinions from Court Listener API to Supabase')
    parser.add_argument('--court-id', type=str, default='scotus', help='Court Listener court ID (default: scotus)')
    parser.add_argument('--per-page', type=int, default=20, help='Number of results per page')
    parser.add_argument('--max-pages', type=int, default=50,help='Maximum number of pages to process')
    parser.add_argument('--skip-storage', action='store_true', help='Skip downloading and uploading documents to storage')

    args = parser.parse_args()

    # Initialize Supabase client
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Sync opinions to Supabase
    synced_opinions = sync_opinions_to_supabase(
        supabase,
        court_remote_id=args.court_id,
        max_pages=args.max_pages,
        skip_storage=args.skip_storage
    )

    logger.info(f"Synced {len(synced_opinions)} opinions to Supabase")

if __name__ == "__main__":
    main()
