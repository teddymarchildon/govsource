from fastapi import APIRouter
from app.api.v1 import congressmen, bills

api_router = APIRouter()

api_router.include_router(congressmen.router, prefix="/congressmen", tags=["congressmen"])
api_router.include_router(bills.router, prefix="/bills", tags=["bills"])
