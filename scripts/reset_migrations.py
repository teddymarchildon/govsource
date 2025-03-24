#!/usr/bin/env python
"""
Script to reset migration history and create a new baseline migration.
This script:
1. Creates a SQL script to drop the BillText table
2. Updates the alembic_version table to point to the last known good migration
"""
import os
import sys

# Add the project root directory to Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text

from app.database import engine


def reset_migrations():
    """Reset migration history and drop BillText table."""
    # The revision ID of the last known good migration
    last_good_revision = "81288a46259d"  # This is the revision you showed

    with engine.connect() as connection:
        # Begin a transaction
        with connection.begin():
            print("Dropping BillText table...")
            # Drop the BillText table if it exists
            connection.execute(text("DROP TABLE IF EXISTS bill_texts CASCADE;"))

            print(f"Setting alembic_version to {last_good_revision}...")
            # Update the alembic_version table to point to the last known good migration
            connection.execute(text("DELETE FROM alembic_version;"))
            connection.execute(
                text("INSERT INTO alembic_version (version_num) VALUES (:version)"),
                {"version": last_good_revision},
            )

            print("Migration history reset successfully.")


if __name__ == "__main__":
    reset_migrations()
