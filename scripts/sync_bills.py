#!/usr/bin/env python3
"""
Script to sync bills from the Congress API to the database.
"""
import argparse
import logging
import sys
import os
from dotenv import load_dotenv
import math

# Add the parent directory to the path so we can import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.services.congress_api import sync_bills

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Maximum limit allowed by the API
MAX_API_LIMIT = 250

def main():
    """Main function to run the bill sync process."""
    parser = argparse.ArgumentParser(description="Sync bills from the Congress API")
    parser.add_argument("--congress", type=int, default=118,
                        help="Congress number (default: 118)")
    parser.add_argument("--limit", type=int, default=20,
                        help="Total number of bills to sync (default: 20, use -1 for all available)")
    parser.add_argument("--offset", type=int, default=0,
                        help="Starting offset for pagination (default: 0)")
    parser.add_argument("--max-batches", type=int, default=100,
                        help="Maximum number of batches to sync when using limit=-1 (default: 100)")
    args = parser.parse_args()

    # Check if API key is set
    if not os.getenv("CONGRESS_API_KEY"):
        logger.error("CONGRESS_API_KEY environment variable is not set")
        sys.exit(1)

    # Create database session
    db = SessionLocal()

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
            
            logger.info(f"Starting batch {batch_num} with offset {current_offset}, batch size {batch_size}")
            
            # Sync bills for this batch
            bills = sync_bills(db, congress=args.congress, limit=batch_size, offset=current_offset)
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
        db.rollback()
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    main()
