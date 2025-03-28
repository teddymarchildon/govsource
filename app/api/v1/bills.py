from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.congress import Bill as BillModel
from app.models.congress import BillText
from app.schemas.congress import Bill, BillList
from app.schemas.congress import BillText as BillTextSchema
from app.schemas.congress import BillWithCongressmen

router = APIRouter()


@router.get("", response_model=BillList)  # type: ignore
def get_bills(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    congress: Optional[int] = None,
    bill_type: Optional[str] = None,
    policy_area: Optional[str] = None,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Get a list of bills with optional filtering.
    """
    # Use joinedload to eagerly load sponsors and text_versions
    query = db.query(BillModel).options(
        joinedload(BillModel.sponsors), joinedload(BillModel.text_versions)
    )

    # Apply filters if provided
    if congress:
        query = query.filter(BillModel.congress == congress)
    if bill_type:
        query = query.filter(BillModel.bill_type == bill_type)
    if policy_area:
        # Filter for bills that have the specified policy area in their policy_areas array
        query = query.filter(BillModel.policy_areas.any(policy_area))
    if status:
        # Filter by status if provided
        query = query.filter(BillModel.status.ilike(f"%{status}%"))

    # Filter for bills that have at least one text version with a PDF URL
    query = (
        query.join(BillText, BillModel.bill_id == BillText.formatted_bill_id)
        .filter(BillText.pdf_url.isnot(None))
        .distinct()
    )
    total = query.count()

    # Apply pagination
    bills = query.order_by(desc(BillModel.introduced_date)).offset(skip).limit(limit).all()

    # Add text URLs to each bill
    bills_with_text = []
    for bill in bills:
        # Find the most recent text version from the prefetched text_versions
        most_recent_text = None
        if bill.text_versions:
            # Filter for text versions with PDF URLs if needed
            text_versions_with_pdf = [t for t in bill.text_versions if t.pdf_url is not None]
            if text_versions_with_pdf:
                most_recent_text = max(text_versions_with_pdf, key=lambda x: x.date)

        if most_recent_text:
            bill.most_recent_congress_pdf_url = most_recent_text.pdf_url
            bill.most_recent_formatted_text_url = most_recent_text.formatted_text_url
            bills_with_text.append(bill)
        else:
            bill.most_recent_congress_pdf_url = None
            bill.most_recent_formatted_text_url = None
            bills_with_text.append(bill)

    # Calculate pagination info
    page_size = limit
    page = skip // page_size + 1
    pages = (total + page_size - 1) // page_size  # Ceiling division

    return {
        "items": bills_with_text,
        "total": total,
        "page": page,
        "pages": pages,
        "size": page_size,
    }


@router.get("/{bill_id}", response_model=BillWithCongressmen)
def get_bill(bill_id: str, db: Session = Depends(get_db)) -> BillModel:
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
        .filter(BillText.formatted_bill_id == bill.bill_id)
        .order_by(desc(BillText.date))
        .first()
    )

    if most_recent_text:
        bill.most_recent_congress_pdf_url = most_recent_text.pdf_url
        bill.most_recent_formatted_text_url = most_recent_text.formatted_text_url

    return bill


@router.get("/{bill_id}/text", response_model=BillTextSchema)
def get_bill_text(bill_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Get the HTML content of a bill's text.
    """
    bill = db.query(BillModel).filter(BillModel.id == bill_id).first()
    if bill is None:
        raise HTTPException(status_code=404, detail="Bill not found")

    # Get the most recent text version for the bill
    most_recent_text = (
        db.query(BillText)
        .filter(BillText.formatted_bill_id == bill.bill_id)
        .order_by(desc(BillText.date))
        .first()
    )

    if most_recent_text is None or most_recent_text.html_content is None:
        raise HTTPException(status_code=404, detail="Bill text not found")

    return {
        "bill_id": bill.bill_id,
        "title": bill.title,
        "html_content": most_recent_text.html_content,
        "date": most_recent_text.date,
    }
