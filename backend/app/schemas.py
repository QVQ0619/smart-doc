from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class StandardDocOut(BaseModel):
    id: int
    doc_code: str
    title: str
    file_name: str
    size_bytes: Optional[int]
    mime_type: Optional[str]
    created_at: Optional[datetime]
    recognition_status: str
    segment_count: Optional[int] = None
    page_count: Optional[int] = None


class FailedItem(BaseModel):
    name: str
    reason: str


class UploadResult(BaseModel):
    uploaded: list[StandardDocOut]
    failed: list[FailedItem]


class RecognizeResult(BaseModel):
    doc_id: int
    doc_code: str
    recognition_status: str          # done | failed
    segment_count: int
    page_count: Optional[int] = None
    error: Optional[str] = None
