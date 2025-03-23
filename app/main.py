import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.api.router import api_router
from app.config import settings
from app.database import Base, engine, get_db
from app.models import congress

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="API for accessing Congress data",
    version="0.1.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/")  # type: ignore
def read_root() -> dict[str, str]:
    return {"message": "Welcome to the GovLens API"}


@app.get("/health")  # type: ignore
def health_check() -> dict[str, str]:
    return {"status": "healthy"}


# Create tables if they don't exist
Base.metadata.create_all(bind=engine)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
