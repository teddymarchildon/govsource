from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.congress import Congressman as CongressmanModel
from app.schemas.congress import Congressman, CongressmanList, CongressmanWithBills

router = APIRouter()


@router.get("", response_model=CongressmanList)  # type: ignore
def get_congressmen(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    party: Optional[str] = None,
    chamber: Optional[str] = None,
    state: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Get a list of congressmen with optional filtering.
    """
    query = db.query(CongressmanModel)

    # Apply filters if provided
    if party:
        query = query.filter(CongressmanModel.party == party)
    if chamber:
        query = query.filter(CongressmanModel.chamber == chamber)
    if state:
        # Handle multiple states as comma-separated values
        states = [s.strip() for s in state.split(",")]
        if len(states) == 1:
            query = query.filter(CongressmanModel.state == states[0])
        else:
            query = query.filter(CongressmanModel.state.in_(states))

    # Get total count for pagination
    total = query.count()

    # Apply pagination
    congressmen = query.offset(skip).limit(limit).all()

    # Calculate pagination info
    page_size = limit
    page = skip // page_size + 1
    pages = (total + page_size - 1) // page_size  # Ceiling division

    return {"items": congressmen, "total": total, "page": page, "size": page_size, "pages": pages}


@router.get("/{congressman_id}", response_model=CongressmanWithBills)  # type: ignore
def get_congressman(congressman_id: int, db: Session = Depends(get_db)) -> CongressmanWithBills:
    """
    Get detailed information about a specific congressman, including sponsored and cosponsored bills.
    """
    congressman = db.query(CongressmanModel).filter(CongressmanModel.id == congressman_id).first()
    if congressman is None:
        raise HTTPException(status_code=404, detail="Congressman not found")
    return congressman
