from datetime import datetime

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.congress import GovLensModel


class User(GovLensModel):
    """Model for application users"""

    __tablename__ = "users"

    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)

    # Optional profile fields
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)

    # Relationships
    saved_bills = relationship("SavedBill", back_populates="user", cascade="all, delete-orphan")
    saved_congressmen = relationship(
        "SavedCongressman", back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<User {self.email}>"


class SavedBill(GovLensModel):
    """Model for bills saved by users"""

    __tablename__ = "saved_bills"

    user_id = Column(Integer, ForeignKey("users.id"))
    bill_id = Column(Integer, ForeignKey("bills.id"))
    notes = Column(Text, nullable=True)

    # Relationships
    user = relationship("User", back_populates="saved_bills")
    bill = relationship("Bill")

    __table_args__ = (UniqueConstraint("user_id", "bill_id", name="uix_user_bill"),)


class SavedCongressman(GovLensModel):
    """Model for congressmen saved by users"""

    __tablename__ = "saved_congressmen"

    user_id = Column(Integer, ForeignKey("users.id"))
    congressman_id = Column(Integer, ForeignKey("congressmen.id"))
    notes = Column(Text, nullable=True)

    # Relationships
    user = relationship("User", back_populates="saved_congressmen")
    congressman = relationship("Congressman")

    __table_args__ = (UniqueConstraint("user_id", "congressman_id", name="uix_user_congressman"),)
