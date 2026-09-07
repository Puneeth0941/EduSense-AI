import uuid
from datetime import datetime
from typing import Any
from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    id: Any
    __name__: str

    # Generate __tablename__ automatically from class name
    def __tablename__(cls) -> str:
        return cls.__name__.lower() + "s"
