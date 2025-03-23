import logging
import os
import socket
import time
from typing import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get database URL from environment variable
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://govlens:govlens@localhost:5432/govlens")

# If we're running locally and the URL contains 'db' as hostname, replace it with 'localhost'
if "db" in DATABASE_URL and not os.path.exists("/.dockerenv"):
    # Check if we can resolve 'db' hostname
    try:
        socket.gethostbyname("db")
    except socket.gaierror:
        # Cannot resolve 'db', we're probably running locally
        DATABASE_URL = DATABASE_URL.replace("@db:", "@localhost:")
        logger.info(f"Running locally, using modified database URL: {DATABASE_URL}")

logger.info(f"Using database URL: {DATABASE_URL}")

# Add connection retry logic
max_retries = 5
retry_delay = 2  # seconds

for attempt in range(max_retries):
    try:
        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,  # Check connection before using it
            pool_recycle=3600,  # Recycle connections after 1 hour
        )
        # Test connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Database connection established successfully")
        break
    except Exception as e:
        if attempt < max_retries - 1:
            logger.warning(
                f"Database connection attempt {attempt + 1} failed: {str(e)}. Retrying in {retry_delay} seconds..."
            )
            time.sleep(retry_delay)
        else:
            logger.error(f"Failed to connect to database after {max_retries} attempts: {str(e)}")
            # Don't raise here, let the application start anyway
            # The database might become available later

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create declarative base
Base = declarative_base()


# Dependency for FastAPI
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
