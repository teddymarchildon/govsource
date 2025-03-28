from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = True
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class UserInDBBase(UserBase):
    id: int

    class Config:
        from_attributes = True


class User(UserInDBBase):
    """User response model"""

    pass


class UserInDB(UserInDBBase):
    """User model stored in DB"""

    hashed_password: str


class Token(BaseModel):
    """Token response model"""

    access_token: str
    token_type: str = "bearer"
    refresh_token: Optional[str] = None


class TokenPayload(BaseModel):
    """Token payload model"""

    sub: Optional[str] = None


class SavedBillBase(BaseModel):
    bill_id: int
    notes: Optional[str] = None


class SavedBillCreate(SavedBillBase):
    pass


class SavedBill(SavedBillBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True


class SavedCongressmanBase(BaseModel):
    congressman_id: int
    notes: Optional[str] = None


class SavedCongressmanCreate(SavedCongressmanBase):
    pass


class SavedCongressman(SavedCongressmanBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True
