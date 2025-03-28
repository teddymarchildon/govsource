import os
from typing import Optional

# Update import for Pydantic v2
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "GovLens API"
    API_V1_STR: str = "/api/v1"

    # Database settings
    POSTGRES_SERVER: str = os.getenv("POSTGRES_SERVER", "localhost")
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "postgres")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "govlens")
    DATABASE_URL: Optional[str] = None
    SQLALCHEMY_DATABASE_URI: Optional[str] = None

    # API settings
    CONGRESS_API_KEY: Optional[str] = os.getenv("CONGRESS_API_KEY")

    # Authentication settings
    SECRET_KEY: str = os.getenv("SECRET_KEY", "govlens_secret_key_change_in_production")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")
    )  # 24 hours
    REFRESH_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("REFRESH_TOKEN_EXPIRE_MINUTES", "10080")
    )  # 7 days

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "ignore"  # Allow extra fields in environment


settings = Settings()

# Set the database URI if not already set
if settings.SQLALCHEMY_DATABASE_URI is None:
    # Use DATABASE_URL if available, otherwise construct from components
    settings.SQLALCHEMY_DATABASE_URI = settings.DATABASE_URL or (
        f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@"
        f"{settings.POSTGRES_SERVER}/{settings.POSTGRES_DB}"
    )
