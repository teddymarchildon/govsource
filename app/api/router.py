from fastapi import APIRouter

from app.api.v1 import bills, congressmen
from app.api.v1.endpoints import auth, saved_items

api_router = APIRouter()

api_router.include_router(congressmen.router, prefix="/congressmen", tags=["congressmen"])
api_router.include_router(bills.router, prefix="/bills", tags=["bills"])
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(saved_items.router, prefix="/users/me/saved", tags=["saved-items"])
