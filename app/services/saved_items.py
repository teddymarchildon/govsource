from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.auth import SavedBill, SavedCongressman
from app.models.congress import Bill, Congressman
from app.schemas.auth import SavedBillCreate, SavedCongressmanCreate


def get_saved_bills(db: Session, user_id: int) -> List[SavedBill]:
    """Get all saved bills for a user"""
    return db.query(SavedBill).filter(SavedBill.user_id == user_id).all()


def get_saved_bill(db: Session, user_id: int, saved_bill_id: int) -> Optional[SavedBill]:
    """Get a specific saved bill for a user"""
    return (
        db.query(SavedBill)
        .filter(SavedBill.id == saved_bill_id, SavedBill.user_id == user_id)
        .first()
    )


def get_saved_bill_by_bill_id(db: Session, user_id: int, bill_id: int) -> Optional[SavedBill]:
    """Check if a user has saved a specific bill"""
    return (
        db.query(SavedBill)
        .filter(SavedBill.bill_id == bill_id, SavedBill.user_id == user_id)
        .first()
    )


def create_saved_bill(db: Session, user_id: int, saved_bill_in: SavedBillCreate) -> SavedBill:
    """Save a bill for a user"""
    # Check if bill exists
    bill = db.query(Bill).filter(Bill.id == saved_bill_in.bill_id).first()
    if not bill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bill not found",
        )

    # Check if already saved
    existing = get_saved_bill_by_bill_id(db, user_id, saved_bill_in.bill_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bill already saved",
        )

    # Create saved bill
    saved_bill = SavedBill(
        user_id=user_id,
        bill_id=saved_bill_in.bill_id,
        notes=saved_bill_in.notes,
    )
    db.add(saved_bill)
    db.commit()
    db.refresh(saved_bill)
    return saved_bill


def update_saved_bill(db: Session, user_id: int, saved_bill_id: int, notes: str) -> SavedBill:
    """Update notes for a saved bill"""
    saved_bill = get_saved_bill(db, user_id, saved_bill_id)
    if not saved_bill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved bill not found",
        )

    saved_bill.notes = notes
    db.add(saved_bill)
    db.commit()
    db.refresh(saved_bill)
    return saved_bill


def delete_saved_bill(db: Session, user_id: int, saved_bill_id: int) -> None:
    """Delete a saved bill"""
    saved_bill = get_saved_bill(db, user_id, saved_bill_id)
    if not saved_bill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved bill not found",
        )

    db.delete(saved_bill)
    db.commit()


def get_saved_congressmen(db: Session, user_id: int) -> List[SavedCongressman]:
    """Get all saved congressmen for a user"""
    return db.query(SavedCongressman).filter(SavedCongressman.user_id == user_id).all()


def get_saved_congressman(
    db: Session, user_id: int, saved_congressman_id: int
) -> Optional[SavedCongressman]:
    """Get a specific saved congressman for a user"""
    return (
        db.query(SavedCongressman)
        .filter(SavedCongressman.id == saved_congressman_id, SavedCongressman.user_id == user_id)
        .first()
    )


def get_saved_congressman_by_congressman_id(
    db: Session, user_id: int, congressman_id: int
) -> Optional[SavedCongressman]:
    """Check if a user has saved a specific congressman"""
    return (
        db.query(SavedCongressman)
        .filter(
            SavedCongressman.congressman_id == congressman_id, SavedCongressman.user_id == user_id
        )
        .first()
    )


def create_saved_congressman(
    db: Session, user_id: int, saved_congressman_in: SavedCongressmanCreate
) -> SavedCongressman:
    """Save a congressman for a user"""
    # Check if congressman exists
    congressman = (
        db.query(Congressman).filter(Congressman.id == saved_congressman_in.congressman_id).first()
    )
    if not congressman:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Congressman not found",
        )

    # Check if already saved
    existing = get_saved_congressman_by_congressman_id(
        db, user_id, saved_congressman_in.congressman_id
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Congressman already saved",
        )

    # Create saved congressman
    saved_congressman = SavedCongressman(
        user_id=user_id,
        congressman_id=saved_congressman_in.congressman_id,
        notes=saved_congressman_in.notes,
    )
    db.add(saved_congressman)
    db.commit()
    db.refresh(saved_congressman)
    return saved_congressman


def update_saved_congressman(
    db: Session, user_id: int, saved_congressman_id: int, notes: str
) -> SavedCongressman:
    """Update notes for a saved congressman"""
    saved_congressman = get_saved_congressman(db, user_id, saved_congressman_id)
    if not saved_congressman:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved congressman not found",
        )

    saved_congressman.notes = notes
    db.add(saved_congressman)
    db.commit()
    db.refresh(saved_congressman)
    return saved_congressman


def delete_saved_congressman(db: Session, user_id: int, saved_congressman_id: int) -> None:
    """Delete a saved congressman"""
    saved_congressman = get_saved_congressman(db, user_id, saved_congressman_id)
    if not saved_congressman:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved congressman not found",
        )

    db.delete(saved_congressman)
    db.commit()
