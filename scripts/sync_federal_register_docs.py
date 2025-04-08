#!/usr/bin/env python3
"""
Script to sync documents from the Federal Register API to Supabase.
"""
import argparse
import logging
import os
import sys
import time
import tempfile
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from pathlib import Path

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

# Federal Register API configuration
FEDERAL_REGISTER_BASE_URL = "https://www.federalregister.gov/api/v1"

# Rate limiting parameters
RATE_LIMIT_REQUESTS_PER_HOUR = 1000
RATE_LIMIT_DELAY_SECONDS = 36 / RATE_LIMIT_REQUESTS_PER_HOUR  # ~3.6 seconds between requests

def fetch_documents(
    agency_id: Optional[str] = None,
    document_type: Optional[str] = None,
    page_size: int = 1000,
    max_pages: Optional[int] = None
) -> List[Dict]:
    """Fetch documents from Federal Register API with rate limiting."""
    documents = []
    page = 1
    total_pages = 1

    while page <= total_pages:
        # Check if we've reached the maximum number of pages
        if max_pages and page > max_pages:
            logger.info(f"Reached maximum page limit of {max_pages}")
            break

        # Add delay between requests to respect rate limits
        if page > 1:
            logger.info(f"Waiting {RATE_LIMIT_DELAY_SECONDS:.2f} seconds before next request...")
            time.sleep(RATE_LIMIT_DELAY_SECONDS)

        params = {
            'conditions[agencies][]': agency_id,
            'conditions[type][]': document_type,
            'per_page': page_size,
            'page': page
        }

        # Remove None values from params
        params = {k: v for k, v in params.items() if v is not None}

        try:
            response = requests.get(
                f"{FEDERAL_REGISTER_BASE_URL}/documents.json",
                params=params
            )
            response.raise_for_status()

            data = response.json()
            documents.extend(data.get('results', []))

            # Update total pages from response
            total_pages = data.get('total_pages', 1)
            logger.info(f"Fetched page {page}/{total_pages} with {len(data.get('results', []))} documents")

            page += 1

        except requests.exceptions.RequestException as e:
            if response.status_code == 429:  # Rate limit exceeded
                retry_after = int(response.headers.get('Retry-After', 60))
                logger.warning(f"Rate limit exceeded. Waiting {retry_after} seconds before retrying...")
                time.sleep(retry_after)
                continue  # Retry the same page
            else:
                logger.error(f"Error fetching documents: {e}")
                break

    return documents

def get_document_details(document_number: str) -> Dict:
    """Fetch document details from Federal Register API."""
    try:
        # Add delay to respect rate limits
        time.sleep(RATE_LIMIT_DELAY_SECONDS)

        response = requests.get(
            f"{FEDERAL_REGISTER_BASE_URL}/documents/{document_number}.json"
        )
        response.raise_for_status()

        return response.json()
    except Exception as e:
        logger.error(f"Error fetching document details for {document_number}: {e}")
        return {}

def download_and_upload_document(
    supabase: Client,
    doc: Dict,
    storage_bucket: str
) -> Optional[Dict[str, str]]:
    """Download document files and upload to Supabase storage."""
    file_paths = {}

    # Get document details to get correct URLs
    doc_details = get_document_details(doc['document_number'])
    if not doc_details:
        logger.error(f"Could not get document details for {doc['document_number']}")
        return file_paths

    # Download and upload PDF
    if doc.get('pdf_url'):
        try:
            logger.info(f"Downloading PDF from {doc['pdf_url']}")
            response = requests.get(doc['pdf_url'])
            response.raise_for_status()

            # Create a temporary file
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_file:
                temp_file.write(response.content)
                temp_file_path = temp_file.name

            # Upload to Supabase storage
            file_name = f"{doc['document_number']}.pdf"
            file_path = f"pdfs/{file_name}"
            file_paths['pdf_file_path'] = file_path

            with open(temp_file_path, 'rb') as f:
                supabase.storage.from_(storage_bucket).upload(
                    file_path,
                    f,
                    {"content-type": "application/pdf"}
                )

            os.unlink(temp_file_path)  # Clean up temp file

        except Exception as e:
            logger.error(f"Error downloading/uploading PDF: {e}")

    # Get HTML content from body_html_url
    body_html_url = doc_details.get('body_html_url')
    if body_html_url:
        try:
            logger.info(f"Fetching HTML content from {body_html_url}")
            # Add delay to respect rate limits
            time.sleep(RATE_LIMIT_DELAY_SECONDS)

            response = requests.get(body_html_url)
            response.raise_for_status()

            html_content = response.text

            if html_content:
                # Upload HTML content to Supabase storage
                file_name = f"{doc['document_number']}.html"
                file_path = f"html/{file_name}"
                file_paths['html_file_path'] = file_path

                supabase.storage.from_(storage_bucket).upload(
                    file_path,
                    html_content.encode('utf-8'),
                    {"content-type": "text/html"}
                )

        except Exception as e:
            logger.error(f"Error fetching/uploading HTML content: {e}")

    # Download and upload XML from full_text_xml_url
    full_text_xml_url = doc_details.get('full_text_xml_url')
    if full_text_xml_url:
        try:
            logger.info(f"Downloading XML from {full_text_xml_url}")
            # Add delay to respect rate limits
            time.sleep(RATE_LIMIT_DELAY_SECONDS)

            response = requests.get(full_text_xml_url)
            response.raise_for_status()

            # Create a temporary file
            with tempfile.NamedTemporaryFile(suffix='.xml', delete=False) as temp_file:
                temp_file.write(response.content)
                temp_file_path = temp_file.name

            # Upload to Supabase storage
            file_name = f"{doc['document_number']}.xml"
            file_path = f"xml/{file_name}"
            file_paths['xml_file_path'] = file_path

            with open(temp_file_path, 'rb') as f:
                supabase.storage.from_(storage_bucket).upload(
                    file_path,
                    f,
                    {"content-type": "application/xml"}
                )
            os.unlink(temp_file_path)  # Clean up temp file

        except Exception as e:
            logger.error(f"Error downloading/uploading XML: {e}")

    return file_paths

def sync_documents_to_supabase(
    supabase: Client,
    agency_id: Optional[int] = None,
    document_type: Optional[str] = None,
    per_page: int = 100,
    max_pages: Optional[int] = None,
    dry_run: bool = False,
    skip_storage: bool = False
) -> List[Dict[str, Any]]:
    """
    Sync documents from the Federal Register API to Supabase.

    Args:
        supabase: Supabase client
        agency_id: Agency ID to filter by
        document_type: Type of document to filter by
        start_date: Start date for filtering (YYYY-MM-DD)
        end_date: End date for filtering (YYYY-MM-DD)
        per_page: Number of results per page
        max_pages: Maximum number of pages to process
        dry_run: Run in dry-run mode (no database writes)
        skip_storage: Skip downloading and uploading documents to storage

    Returns:
        List of dictionaries representing documents that were created or updated
    """
    synced_documents = []
    page = 1

    while True:
        if max_pages and page > max_pages:
            break

        # Fetch documents for the current page
        documents_data = fetch_documents(
            agency_id=agency_id,
            document_type=document_type,
            page_size=per_page,
            max_pages=max_pages
        )

        if not documents_data:
            break

        for doc in documents_data:
            try:
                # Get document details first
                doc_details = get_document_details(doc['document_number'])
                if not doc_details:
                    logger.error(f"Could not get document details for {doc['document_number']}")
                    continue

                # Extract document data from details response
                document_number = doc_details.get("document_number")
                title = doc_details.get("title")
                doc_type = doc_details.get("type")
                publication_date = doc_details.get("publication_date")
                signing_date = doc_details.get("signing_date")
                pdf_url = doc_details.get("pdf_url")
                html_url = doc_details.get("body_html_url")
                xml_url = doc_details.get("full_text_xml_url")
                abstract = doc_details.get("abstract", "")
                subtype = doc_details.get("subtype", "")

                # Check if document already exists in Supabase
                result = (
                    supabase.table("agency_document")
                    .select("id")
                    .eq("remote_document_number", document_number)
                    .execute()
                )

                if result.data:
                    logger.info(f"Document {title} already exists in Supabase, updating...")
                    existing_document_id = result.data[0]["id"]

                    # Download and upload documents to Supabase storage if not skipped
                    file_paths = {}
                    if not skip_storage:
                        file_paths = download_and_upload_document(
                            supabase, doc_details, "agency-docs"
                        )

                    # Update document record
                    document_data = {
                        "title": title,
                        "type": doc_type,
                        "subtype": subtype,
                        "publication_date": publication_date,
                        "signing_date": signing_date,
                        "pdf_url": pdf_url,
                        "html_url": html_url,
                        "xml_url": xml_url,
                        "pdf_file_path": file_paths.get('pdf_file_path'),
                        "html_file_path": file_paths.get('html_file_path'),
                        "xml_file_path": file_paths.get('xml_file_path'),
                        "abstract": abstract,
                        "remote_document_number": document_number
                    }

                    # Update document
                    supabase.table("agency_document").update(document_data).eq("id", existing_document_id).execute()

                    # Update agency-document relationships
                    # First, delete existing relationships
                    supabase.table("agency_agencydocument").delete().eq("agency_document_id", existing_document_id).execute()

                    # Then create new relationships
                    for agency in doc_details.get("agencies", []):
                        agency_id = agency.get("id")
                        if agency_id:
                            # Check if agency exists in our database
                            agency_result = (
                                supabase.table("agency")
                                .select("id")
                                .eq("remote_agency_id", agency_id)
                                .execute()
                            )

                            if agency_result.data:
                                agency_db_id = agency_result.data[0]["id"]
                                # Create relationship
                                relationship_data = {
                                    "agency_id": agency_db_id,
                                    "agency_document_id": existing_document_id
                                }
                                supabase.table("agency_agencydocument").insert(relationship_data).execute()

                    synced_documents.append(document_data)
                    logger.info(f"Updated document: {title}")
                    continue

                # If document doesn't exist, create new one
                # Download and upload documents to Supabase storage if not skipped
                file_paths = {}
                if not skip_storage:
                    file_paths = download_and_upload_document(
                        supabase, doc_details, "agency-docs"
                    )

                # Create document record
                document_data = {
                    "title": title,
                    "type": doc_type,
                    "subtype": subtype,
                    "publication_date": publication_date,
                    "signing_date": signing_date,
                    "pdf_url": pdf_url,
                    "html_url": html_url,
                    "xml_url": xml_url,
                    "pdf_file_path": file_paths.get('pdf_file_path'),
                    "html_file_path": file_paths.get('html_file_path'),
                    "xml_file_path": file_paths.get('xml_file_path'),
                    "abstract": abstract,
                    "remote_document_number": document_number
                }

                # Insert document
                result = supabase.table("agency_document").insert(document_data).execute()
                document_id = result.data[0]["id"]

                # Create agency-document relationships
                for agency in doc_details.get("agencies", []):
                    agency_id = agency.get("id")
                    if agency_id:
                        # Check if agency exists in our database
                        agency_result = (
                            supabase.table("agency")
                            .select("id")
                            .eq("remote_agency_id", agency_id)
                            .execute()
                        )

                        if agency_result.data:
                            agency_db_id = agency_result.data[0]["id"]
                            # Create relationship
                            relationship_data = {
                                "agency_id": agency_db_id,
                                "agency_document_id": document_id
                            }
                            supabase.table("agency_agencydocument").insert(relationship_data).execute()

                synced_documents.append(document_data)
                logger.info(f"Synced document: {title}")

            except Exception as e:
                logger.error(f"Error processing document: {e}", exc_info=True)
                continue

        # Check if there are more pages
        if not documents_data.get("next_page_url"):
            break

        page += 1

    return synced_documents

def main():
    """Main function to run the document sync process."""
    parser = argparse.ArgumentParser(description="Sync documents from Federal Register API to Supabase")
    parser.add_argument(
        "--agency-id",
        type=str,
        help="Agency ID to filter documents by"
    )
    parser.add_argument(
        "--document-type",
        type=str,
        choices=["RULE", "PRORULE", "NOTICE", "PRESDOCU"],
        help="Type of document to filter by (RULE: Final Rule, PRORULE: Proposed Rule, NOTICE: Notice, PRESDOCU: Presidential Document)"
    )
    parser.add_argument(
        "--per-page",
        type=int,
        default=100,
        help="Number of results per page (default: 100)"
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        help="Maximum number of pages to fetch"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run in dry-run mode (no database writes)"
    )
    parser.add_argument(
        "--skip-storage",
        action="store_true",
        help="Skip downloading and uploading documents to storage"
    )
    args = parser.parse_args()

    # Initialize Supabase client
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Sync documents
    synced_documents = sync_documents_to_supabase(
        supabase,
        agency_id=args.agency_id,
        document_type=args.document_type,
        per_page=args.per_page,
        max_pages=args.max_pages,
        dry_run=args.dry_run,
        skip_storage=args.skip_storage
    )

    logger.info(f"Synced {len(synced_documents)} documents to Supabase")

if __name__ == "__main__":
    main()
