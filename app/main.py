from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
import os
from dotenv import load_dotenv

from app.database import get_db, engine, Base
from app.models import congress
from app.api.router import api_router

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="GovLens API",
    description="API for accessing Congress data",
    version="0.1.0",
)

# Include API router
app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def read_root():
    return {"message": "Welcome to GovLens API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
