from sqlalchemy import Column, Integer, String, Text, Date, ForeignKey, Table, Boolean, DateTime, Enum, ARRAY, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.database import Base

class GovLensModel(Base):
    __abstract__ = True
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class PolicyArea(str, enum.Enum):
    """Enum for policy areas"""
    AGRICULTURE = "Agriculture and Food"
    ANIMALS = "Animals"
    ARMED_FORCES = "Armed Forces and National Security"
    ARTS = "Arts, Culture, Religion"
    CIVIL_RIGHTS = "Civil Rights and Liberties, Minority Issues"
    COMMERCE = "Commerce"
    CONGRESS = "Congress"
    CRIME = "Crime and Law Enforcement"
    ECONOMICS = "Economics and Public Finance"
    EDUCATION = "Education"
    EMERGENCY_MANAGEMENT = "Emergency Management"
    ENERGY = "Energy"
    ENVIRONMENTAL_PROTECTION = "Environmental Protection"
    FAMILIES = "Families"
    FINANCE = "Finance and Financial Sector"
    FOREIGN_TRADE = "Foreign Trade and International Finance"
    GOVERNMENT_OPERATIONS = "Government Operations and Politics"
    HEALTH = "Health"
    HOUSING = "Housing and Community Development"
    IMMIGRATION = "Immigration"
    INTERNATIONAL_AFFAIRS = "International Affairs"
    LABOR = "Labor and Employment"
    LAW = "Law"
    NATIVE_AMERICANS = "Native Americans"
    PUBLIC_LANDS = "Public Lands and Natural Resources"
    SCIENCE = "Science, Technology, Communications"
    SOCIAL_SCIENCES = "Social Sciences and History"
    SOCIAL_WELFARE = "Social Welfare"
    SPORTS = "Sports and Recreation"
    TAXATION = "Taxation"
    TRANSPORTATION = "Transportation and Public Works"
    WATER = "Water Resources Development"

class Party(str, enum.Enum):
    """Enum for political parties"""
    DEMOCRAT = "Democrat"
    REPUBLICAN = "Republican"
    INDEPENDENT = "Independent"
    LIBERTARIAN = "Libertarian"
    GREEN = "Green"
    OTHER = "Other"

class Chamber(str, enum.Enum):
    """Enum for congressional chambers"""
    HOUSE = "house"
    SENATE = "senate"

# Association table for the many-to-many relationship between bills and cosponsors
bill_cosponsor = Table(
    "bill_cosponsor",
    Base.metadata,
    Column("bill_id", Integer, ForeignKey("bills.id"), primary_key=True),
    Column("congressman_id", Integer, ForeignKey("congressmen.id"), primary_key=True)
)

# Association table for the many-to-many relationship between bills and sponsors
bill_sponsor = Table(
    "bill_sponsor",
    Base.metadata,
    Column("bill_id", Integer, ForeignKey("bills.id"), primary_key=True),
    Column("congressman_id", Integer, ForeignKey("congressmen.id"), primary_key=True)
)

class Congressman(GovLensModel):
    """Model for members of Congress (Representatives and Senators)"""
    __tablename__ = "congressmen"

    bioguide_id = Column(String(20), unique=True, index=True)
    first_name = Column(String(100))
    last_name = Column(String(100))
    middle_name = Column(String(100), nullable=True)
    suffix = Column(String(20), nullable=True)
    nickname = Column(String(100), nullable=True)
    full_name = Column(String(255))
    party = Column(Enum(Party), nullable=False)
    chamber = Column(Enum(Chamber), nullable=False)
    leadership_role = Column(String(255), nullable=True)
    twitter_account = Column(String(100), nullable=True)
    facebook_account = Column(String(100), nullable=True)
    youtube_account = Column(String(100), nullable=True)
    website = Column(String(255), nullable=True)
    office = Column(String(255), nullable=True)
    phone = Column(String(20), nullable=True)
    state = Column(String(50))
    district = Column(String(10), nullable=True)  # Changed to String to handle both integers and empty values

    # Relationships
    sponsored_bills = relationship("Bill", secondary=bill_sponsor, back_populates="sponsors")
    cosponsored_bills = relationship("Bill", secondary=bill_cosponsor, back_populates="cosponsors")

    def __repr__(self):
        return f"<Congressman {self.full_name} ({self.party}-{self.state})>"


class Bill(GovLensModel):
    """Model for legislative bills"""
    __tablename__ = "bills"

    congress = Column(Integer)  # e.g., 117 for 117th Congress
    bill_id = Column(String(20), unique=True, index=True)  # e.g., "hr1234-117"
    bill_type = Column(String(10))  # e.g., "hr", "s", "hjres", "sjres"
    bill_number = Column(Integer)  # e.g., 1234
    title = Column(Text)  # Changed from String(500) to Text for longer titles
    introduced_date = Column(Date)
    policy_areas = Column(ARRAY(String(100)), nullable=True)  # Array of policy area strings

    # Relationships
    sponsors = relationship("Congressman", secondary=bill_sponsor, back_populates="sponsored_bills")
    cosponsors = relationship("Congressman", secondary=bill_cosponsor, back_populates="cosponsored_bills")
    text_versions = relationship("BillText", back_populates="bill", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Bill {self.bill_id}: {self.title[:50] + '...'}>"


class BillText(GovLensModel):
    """Model for bill text versions"""
    __tablename__ = "bill_texts"

    bill_id = Column(String(20), ForeignKey("bills.bill_id"), index=True)
    type = Column(Text)  # e.g., "Introduced in House"
    date = Column(Date)
    pdf_url = Column(String(500), nullable=True)
    formatted_text_url = Column(String(500), nullable=True)
    xml_url = Column(String(500), nullable=True)

    # Relationships
    bill = relationship("Bill", back_populates="text_versions")

    __table_args__ = (
        UniqueConstraint('bill_id', 'type', name='uix_bill_type'),
    )

    def __repr__(self):
        return f"<BillText {self.bill_id} {self.version_code}: {self.version_name}>"
