#!/usr/bin/env python3
"""
Script to download bill text HTML content from formatted_text_url links
and save it to the database.
"""
import argparse
import logging
import os
import sys
import time
from typing import List, Optional

# Add the parent directory to the path so we can import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.congress import BillText

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def download_html_content(url: str, retries: int = 3, delay: int = 1) -> Optional[str]:
    """
    Download HTML content from a URL with retry logic.

    Args:
        url: The URL to download content from
        retries: Number of retry attempts
        delay: Delay between retries in seconds

    Returns:
        The HTML content as a string or None if download failed
    """
    if not url:
        return None

    for attempt in range(retries):
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            return response.text
        except requests.RequestException as e:
            logger.warning(f"Attempt {attempt + 1}/{retries} failed for {url}: {e}")
            if attempt < retries - 1:
                time.sleep(delay)
            else:
                logger.error(f"Failed to download content from {url} after {retries} attempts")
                return None


def get_bill_texts_without_html(db: Session, limit: Optional[int] = None) -> List[BillText]:
    """
    Get bill texts that have a formatted_text_url but no html_content.

    Args:
        db: Database session
        limit: Optional limit on the number of records to retrieve

    Returns:
        List of BillText objects
    """
    query = (
        select(BillText)
        .where(BillText.formatted_text_url.is_not(None))
        .where(BillText.html_content.is_(None))
    )

    if limit:
        query = query.limit(limit)

    return list(db.execute(query).scalars().all())


def download_and_save_bill_texts(limit: Optional[int] = None, batch_size: int = 10) -> None:
    """
    Download bill text HTML content and save it to the database.

    Args:
        limit: Optional limit on the number of records to process
        batch_size: Number of records to process in a batch before committing
    """
    db = SessionLocal()
    try:
        bill_texts = get_bill_texts_without_html(db, limit)
        logger.info(f"Found {len(bill_texts)} bill texts without HTML content")

        for i, bill_text in enumerate(bill_texts):
            logger.info(
                f"Processing {i+1}/{len(bill_texts)}: {bill_text.formatted_bill_id} ({bill_text.type})"
            )

            html_content = download_html_content(bill_text.formatted_text_url)
            if html_content:
                bill_text.html_content = html_content
                logger.info(
                    f"Downloaded HTML content for {bill_text.formatted_bill_id} ({bill_text.type})"
                )
            else:
                logger.warning(
                    f"Failed to download HTML content for {bill_text.formatted_bill_id} ({bill_text.type})"
                )

            # Commit in batches to avoid large transactions
            if (i + 1) % batch_size == 0 or i == len(bill_texts) - 1:
                db.commit()
                logger.info(f"Committed batch of records (batch {(i + 1) // batch_size})")
    except Exception as e:
        logger.exception(f"Error downloading bill texts: {e}")
        db.rollback()
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Download bill text HTML content")
    parser.add_argument(
        "--limit", type=int, help="Limit the number of bill texts to process", default=None
    )
    parser.add_argument(
        "--batch-size", type=int, help="Number of records to process in a batch", default=10
    )

    args = parser.parse_args()

    logger.info("Starting bill text HTML content download")
    download_and_save_bill_texts(limit=args.limit, batch_size=args.batch_size)
    logger.info("Finished bill text HTML content download")


if __name__ == "__main__":
    main()
