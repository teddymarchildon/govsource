#!/usr/bin/env python
"""
Script to drop the BillText table from the database while keeping the model code.
"""
import os
import sys

# Add the project root directory to Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text

from app.database import SessionLocal, engine
from app.models.congress import BillText


def drop_bill_text_table():
    """Drop the BillText table from the database."""
    print(f"Dropping table: {BillText.__tablename__}")

    # Method 1: Using SQLAlchemy metadata
    BillText.__table__.drop(engine, checkfirst=True)

    print("Table dropped successfully.")


if __name__ == "__main__":
    drop_bill_text_table()
