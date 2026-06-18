from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category: str
    original_name: str
    size_bytes: int
    mime_type: str
    sha256: str
    created_at: datetime


class FailedItem(BaseModel):
    name: str
    reason: str


class UploadResult(BaseModel):
    uploaded: list[DocumentOut]
    failed: list[FailedItem]
