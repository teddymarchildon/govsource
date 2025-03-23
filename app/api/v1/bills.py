from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.congress import Bill as BillModel
from app.schemas.congress import Bill, BillList

router = APIRouter()

@router.get("", response_model=BillList)
def get_bills(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    congress: Optional[int] = None,
    bill_type: Optional[str] = None,
    status: Optional[str] = None,
):
    """
    Get a list of bills with optional filtering.
    """
    query = db.query(BillModel)

    # Apply filters if provided
    if congress:
        query = query.filter(BillModel.congress == congress)
    if bill_type:
        query = query.filter(BillModel.bill_type == bill_type)
    if status:
        query = query.filter(BillModel.status == status)

    # Get total count for pagination
    total = query.count()

    # Apply pagination
    bills = query.offset(skip).limit(limit).all()

    # Calculate pagination info
    page_size = limit
    page = skip // page_size + 1
    pages = (total + page_size - 1) // page_size  # Ceiling division

    return {
        "items": bills,
        "total": total,
        "page": page,
        "size": page_size,
        "pages": pages
    }

@router.get("/{bill_id}", response_model=Bill)
def get_bill(bill_id: int, db: Session = Depends(get_db)):
    """
    Get detailed information about a specific bill, including sponsors and cosponsors.
    """
    bill = db.query(BillModel).filter(BillModel.id == bill_id).first()
    if bill is None:
        raise HTTPException(status_code=404, detail="Bill not found")
    return bill

