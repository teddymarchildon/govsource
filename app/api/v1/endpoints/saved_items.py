from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.auth import User
from app.schemas.auth import (
    SavedBill,
    SavedBillCreate,
    SavedBillWithBill,
    SavedCongressman,
    SavedCongressmanCreate,
    SavedCongressmanWithCongressman,
)
from app.services.auth import get_current_active_user
from app.services.saved_items import (
    create_saved_bill,
    create_saved_congressman,
    delete_saved_bill,
    delete_saved_congressman,
    get_saved_bill,
    get_saved_bills,
    get_saved_congressman,
    get_saved_congressmen,
    update_saved_bill,
    update_saved_congressman,
)

router = APIRouter()


@router.get("/bills", response_model=List[SavedBillWithBill])
def read_saved_bills(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get all saved bills for the current user.
    """
    saved_bills = get_saved_bills(db, user_id=current_user.id)
    return saved_bills


@router.post("/bills", response_model=SavedBillWithBill)
def save_bill(
    saved_bill_in: SavedBillCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Save a bill for the current user.
    """
    saved_bill = create_saved_bill(db, user_id=current_user.id, saved_bill_in=saved_bill_in)
    return saved_bill


@router.get("/bills/{saved_bill_id}", response_model=SavedBillWithBill)
def read_saved_bill(
    saved_bill_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get a specific saved bill for the current user.
    """
    saved_bill = get_saved_bill(db, user_id=current_user.id, saved_bill_id=saved_bill_id)
    if not saved_bill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved bill not found",
        )
    return saved_bill


@router.put("/bills/{saved_bill_id}", response_model=SavedBillWithBill)
def update_bill_notes(
    saved_bill_id: int,
    notes: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Update notes for a saved bill.
    """
    saved_bill = update_saved_bill(
        db, user_id=current_user.id, saved_bill_id=saved_bill_id, notes=notes
    )
    return saved_bill


@router.delete("/bills/{saved_bill_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_saved_bill(
    saved_bill_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> None:
    """
    Delete a saved bill.
    """
    delete_saved_bill(db, user_id=current_user.id, saved_bill_id=saved_bill_id)


@router.get("/congressmen", response_model=List[SavedCongressman])
def read_saved_congressmen(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get all saved congressmen for the current user.
    """
    saved_congressmen = get_saved_congressmen(db, user_id=current_user.id)
    return saved_congressmen


@router.post("/congressmen", response_model=SavedCongressman)
def save_congressman(
    saved_congressman_in: SavedCongressmanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Save a congressman for the current user.
    """
    saved_congressman = create_saved_congressman(
        db, user_id=current_user.id, saved_congressman_in=saved_congressman_in
    )
    return saved_congressman


@router.get("/congressmen/{saved_congressman_id}", response_model=SavedCongressman)
def read_saved_congressman(
    saved_congressman_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get a specific saved congressman for the current user.
    """
    saved_congressman = get_saved_congressman(
        db, user_id=current_user.id, saved_congressman_id=saved_congressman_id
    )
    if not saved_congressman:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved congressman not found",
        )
    return saved_congressman


@router.put("/congressmen/{saved_congressman_id}", response_model=SavedCongressman)
def update_congressman_notes(
    saved_congressman_id: int,
    notes: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Update notes for a saved congressman.
    """
    saved_congressman = update_saved_congressman(
        db, user_id=current_user.id, saved_congressman_id=saved_congressman_id, notes=notes
    )
    return saved_congressman


@router.delete("/congressmen/{saved_congressman_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_saved_congressman(
    saved_congressman_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> None:
    """
    Delete a saved congressman.
    """
    delete_saved_congressman(db, user_id=current_user.id, saved_congressman_id=saved_congressman_id)
