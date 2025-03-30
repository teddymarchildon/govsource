from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# Enum definitions
class Party(str, Enum):
    DEMOCRAT = "Democrat"
    REPUBLICAN = "Republican"
    INDEPENDENT = "Independent"
    LIBERTARIAN = "Libertarian"
    GREEN = "Green"
    OTHER = "Other"


class Chamber(str, Enum):
    HOUSE = "house"
    SENATE = "senate"


# Base schemas
class CongressmanBase(BaseModel):
    bioguide_id: str
    first_name: str
    last_name: str
    middle_name: Optional[str] = None
    suffix: Optional[str] = None
    nickname: Optional[str] = None
    full_name: str
    party: Party
    chamber: Chamber
    leadership_role: Optional[str] = None
    twitter_account: Optional[str] = None
    facebook_account: Optional[str] = None
    youtube_account: Optional[str] = None
    website: Optional[str] = None
    office: Optional[str] = None
    phone: Optional[str] = None
    state: str
    district: Optional[str] = None


class CongressmanTermBase(BaseModel):
    """Base schema for congressman term data"""

    congress: int
    chamber: Chamber
    start_year: int
    end_year: Optional[int] = None
    state_code: str = ""
    state_name: str = ""
    district: Optional[str] = None
    member_type: str = ""


class BillBase(BaseModel):
    congress: int
    bill_id: str
    bill_type: str
    bill_number: int
    title: str
    short_title: Optional[str] = None
    introduced_date: Optional[datetime] = None
    policy_areas: List[str] = []


# Response schemas
class Congressman(CongressmanBase):
    id: int
    created_at: datetime
    updated_at: datetime
    terms: List["CongressmanTerm"] = []

    class Config:
        orm_mode = True
        from_attributes = True


class CongressmanTerm(CongressmanTermBase):
    """Schema for congressman term response"""

    id: int
    congressman_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True


class Bill(BillBase):
    id: int
    created_at: datetime
    updated_at: datetime
    most_recent_congress_pdf_url: Optional[str] = None
    most_recent_formatted_text_url: Optional[str] = None
    sponsors: List["Congressman"] = []
    cosponsors: List["Congressman"] = []
    law: Optional["Law"] = None

    class Config:
        orm_mode = True
        from_attributes = True


class CongressmanWithBills(Congressman):
    sponsored_bills: List["Bill"] = []
    cosponsored_bills: List["Bill"] = []


class CongressmanWithTerms(Congressman):
    """Schema for congressman response with terms"""

    terms: List["CongressmanTerm"] = []


class BillWithCongressmen(Bill):
    sponsors: List["Congressman"] = []
    cosponsors: List["Congressman"] = []


# Law schemas
class LawBase(BaseModel):
    """Base schema for law data"""

    congress: int
    law_type: str  # "pub" for public, "pvt" for private
    law_number: str  # e.g., "117-108"
    law_id: str  # e.g., "117-pub-108"
    title: str
    enacted_date: Optional[datetime] = None
    bill_id: Optional[str] = None


class Law(LawBase):
    """Schema for law response"""

    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True


class LawWithBill(Law):
    """Schema for law response with related bill"""

    bill: Optional["Bill"] = None


# Law text schemas
class LawTextBase(BaseModel):
    """Base schema for law text data"""

    law_id: str
    version_code: str
    version_name: str
    date: Optional[datetime] = None
    pdf_url: Optional[str] = None
    html_url: Optional[str] = None
    xml_url: Optional[str] = None


class LawText(LawTextBase):
    """Schema for law text response"""

    id: int
    created_at: datetime
    updated_at: datetime
    html_content: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True


class LawWithTextVersions(Law):
    """Schema for law response with text versions"""

    text_versions: List["LawText"] = []


# List response schemas
class CongressmanList(BaseModel):
    items: List[Congressman]
    total: int
    page: int
    size: int
    pages: int


class BillList(BaseModel):
    items: List[Bill]
    total: int
    page: int
    size: int
    pages: int


class BillText(BaseModel):
    """Schema for bill text response"""

    bill_id: str
    title: str
    html_content: str
    date: datetime


class LawList(BaseModel):
    """Schema for paginated law list response"""

    items: List[Law]
    total: int
    page: int
    size: int
    pages: int


# Update forward references
Congressman.update_forward_refs()
Bill.update_forward_refs()
CongressmanWithBills.update_forward_refs()
CongressmanWithTerms.update_forward_refs()
BillWithCongressmen.update_forward_refs()
LawWithBill.update_forward_refs()
LawWithTextVersions.update_forward_refs()
