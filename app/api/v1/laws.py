from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.congress import Law as LawModel
from app.models.congress import LawText
from app.schemas.congress import Law, LawList
from app.schemas.congress import LawText as LawTextSchema
from app.schemas.congress import LawWithBill, LawWithTextVersions

router = APIRouter()


@router.get("", response_model=LawList)  # type: ignore
def get_laws(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    congress: Optional[int] = None,
    law_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Get a list of laws with optional filtering.
    """
    # Use joinedload to eagerly load bill and text_versions
    query = db.query(LawModel).options(
        joinedload(LawModel.bill), joinedload(LawModel.text_versions)
    )

    # Apply filters if provided
    if congress:
        query = query.filter(LawModel.congress == congress)
    if law_type:
        query = query.filter(LawModel.law_type == law_type)

    total = query.count()

    # Apply pagination
    laws = query.order_by(desc(LawModel.enacted_date)).offset(skip).limit(limit).all()

    # Calculate pagination info
    page_size = limit
    page = skip // page_size + 1
    pages = (total + page_size - 1) // page_size  # Ceiling division

    return {
        "items": laws,
        "total": total,
        "page": page,
        "pages": pages,
        "size": page_size,
    }


@router.get("/{law_id}", response_model=LawWithTextVersions)
def get_law(law_id: str, db: Session = Depends(get_db)) -> LawModel:
    """
    Get detailed information about a specific law, including text versions.
    """
    # Use joinedload to eagerly load text_versions and bill
    law = (
        db.query(LawModel)
        .options(joinedload(LawModel.text_versions), joinedload(LawModel.bill))
        .filter(LawModel.law_id == law_id)
        .first()
    )

    if law is None:
        raise HTTPException(status_code=404, detail="Law not found")

    return law


@router.get("/congress/{congress}", response_model=LawList)
def get_laws_by_congress(
    congress: int,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
) -> Dict[str, Any]:
    """
    Get laws from a specific Congress.
    """
    query = db.query(LawModel).filter(LawModel.congress == congress)

    total = query.count()
    laws = query.order_by(desc(LawModel.enacted_date)).offset(skip).limit(limit).all()

    # Calculate pagination info
    page_size = limit
    page = skip // page_size + 1
    pages = (total + page_size - 1) // page_size  # Ceiling division

    return {
        "items": laws,
        "total": total,
        "page": page,
        "pages": pages,
        "size": page_size,
    }


@router.get("/congress/{congress}/type/{law_type}", response_model=LawList)
def get_laws_by_congress_and_type(
    congress: int,
    law_type: str,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
) -> Dict[str, Any]:
    """
    Get laws from a specific Congress and of a specific type (public or private).
    """
    query = db.query(LawModel).filter(LawModel.congress == congress, LawModel.law_type == law_type)

    total = query.count()
    laws = query.order_by(desc(LawModel.enacted_date)).offset(skip).limit(limit).all()

    # Calculate pagination info
    page_size = limit
    page = skip // page_size + 1
    pages = (total + page_size - 1) // page_size  # Ceiling division

    return {
        "items": laws,
        "total": total,
        "page": page,
        "pages": pages,
        "size": page_size,
    }


@router.get("/congress/{congress}/type/{law_type}/number/{law_number}", response_model=LawWithBill)
def get_law_by_congress_type_number(
    congress: int,
    law_type: str,
    law_number: str,
    db: Session = Depends(get_db),
) -> LawModel:
    """
    Get a specific law by Congress, type, and law number.
    """
    law = (
        db.query(LawModel)
        .options(joinedload(LawModel.bill))
        .filter(
            LawModel.congress == congress,
            LawModel.law_type == law_type,
            LawModel.law_number == law_number,
        )
        .first()
    )

    if law is None:
        raise HTTPException(status_code=404, detail="Law not found")

    return law


@router.get("/{law_id}/text/{version_code}", response_model=LawTextSchema)
def get_law_text(law_id: str, version_code: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Get the HTML content of a specific version of a law's text.
    """
    law = db.query(LawModel).filter(LawModel.law_id == law_id).first()
    if law is None:
        raise HTTPException(status_code=404, detail="Law not found")

    # Get the specified text version
    text_version = (
        db.query(LawText)
        .filter(LawText.law_id == law_id, LawText.version_code == version_code)
        .first()
    )

    if text_version is None or text_version.html_content is None:
        raise HTTPException(status_code=404, detail="Law text not found")

    return {
        "law_id": law.law_id,
        "version_code": text_version.version_code,
        "version_name": text_version.version_name,
        "date": text_version.date,
        "html_content": text_version.html_content,
        "pdf_url": text_version.pdf_url,
        "html_url": text_version.html_url,
        "xml_url": text_version.xml_url,
    }
