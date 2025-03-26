from datetime import datetime
from enum import Enum
from typing import List, Optional

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


class BillBase(BaseModel):
    congress: int
    bill_id: str
    bill_type: str
    bill_number: int
    title: str
    short_title: Optional[str] = None
    introduced_date: datetime
    most_recent_formatted_text_url: Optional[str] = None
    most_recent_congress_pdf_url: Optional[str] = None
    policy_areas: Optional[List[str]] = None


# Response schemas
class Congressman(CongressmanBase):
    id: int
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

    class Config:
        orm_mode = True
        from_attributes = True


class CongressmanWithBills(Congressman):
    sponsored_bills: List[Bill] = []
    cosponsored_bills: List[Bill] = []


class BillWithCongressmen(Bill):
    sponsors: List[Congressman] = []
    cosponsors: List[Congressman] = []


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
