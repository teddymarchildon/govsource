from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.congress import Bill as BillModel
from app.models.congress import BillText
from app.schemas.congress import Bill, BillList, BillWithCongressmen

router = APIRouter()


@router.get("", response_model=BillList)  # type: ignore
def get_bills(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    congress: Optional[int] = None,
    bill_type: Optional[str] = None,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Get a list of bills with optional filtering.
    """
    # Use joinedload to eagerly load sponsors
    query = db.query(BillModel).options(joinedload(BillModel.sponsors))

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
    bills = query.order_by(desc(BillModel.introduced_date)).offset(skip).limit(limit).all()

    # Add text URLs to each bill
    bills_with_text = []
    for bill in bills:
        # Get the most recent text version for each bill
        most_recent_text = (
            db.query(BillText)
            .filter(BillText.bill_id == bill.bill_id)
            .order_by(desc(BillText.date))
            .first()
        )

        if most_recent_text:
            bill.most_recent_congress_pdf_url = most_recent_text.pdf_url
            bill.most_recent_formatted_text_url = most_recent_text.formatted_text_url
            # Only include bills that have both PDF and formatted text URLs
            if most_recent_text.pdf_url and most_recent_text.formatted_text_url:
                # Add sponsor information
                if bill.sponsors and len(bill.sponsors) > 0:
                    bill.sponsor = bill.sponsors[0]
                bills_with_text.append(bill)
        else:
            bill.most_recent_congress_pdf_url = None
            bill.most_recent_formatted_text_url = None

    # Recalculate total for pagination based on filtered bills
    total_with_text = len(bills_with_text)

    # Calculate pagination info
    page_size = limit
    page = skip // page_size + 1
    pages = (total_with_text + page_size - 1) // page_size  # Ceiling division

    return {
        "items": bills_with_text,
        "total": total_with_text,
        "page": page,
        "pages": pages,
        "size": page_size,
    }


@router.get("/{bill_id}", response_model=Bill)  # type: ignore
def get_bill(bill_id: str, db: Session = Depends(get_db)) -> Bill:
    """
    Get detailed information about a specific bill, including sponsors and cosponsors.
    """
    # Use joinedload to eagerly load sponsors and cosponsors
    bill = (
        db.query(BillModel)
        .options(joinedload(BillModel.sponsors), joinedload(BillModel.cosponsors))
        .filter(BillModel.id == bill_id)
        .first()
    )

    if bill is None:
        raise HTTPException(status_code=404, detail="Bill not found")

    # Get the most recent text version for the bill
    most_recent_text = (
        db.query(BillText)
        .filter(BillText.bill_id == bill.bill_id)
        .order_by(desc(BillText.date))
        .first()
    )

    if most_recent_text:
        bill.most_recent_congress_pdf_url = most_recent_text.pdf_url
        bill.most_recent_formatted_text_url = most_recent_text.formatted_text_url
    else:
        bill.most_recent_congress_pdf_url = None
        bill.most_recent_formatted_text_url = None

    # Add sponsor information
    if bill.sponsors and len(bill.sponsors) > 0:
        bill.sponsor = bill.sponsors[0]

    return bill
