from datetime import datetime
from typing import Any, Optional

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


class SegmentOut(BaseModel):
    id: int
    page_no: Optional[int]
    locator: Optional[Any]
    segment_type: str
    content_text: Optional[str]


class ClauseIn(BaseModel):
    clause_no: str
    clause_text: Optional[str] = None
    source_segment_id: Optional[int] = None


class ClauseBatchIn(BaseModel):
    clauses: list[ClauseIn]


class ClauseWriteResult(BaseModel):
    inserted: int
    missing_provenance: int


class ClauseOut(BaseModel):
    id: int
    clause_no: str
    clause_text: Optional[str]
    source_segment_id: Optional[int]
    page_no: Optional[int]
    locator: Optional[Any]


class RuleIn(BaseModel):
    source_clause_id: int
    dimension_code: str
    name: str
    logic: Optional[str] = None
    decision_type: str
    disposition: str
    binding_class: str


class RuleBatchIn(BaseModel):
    rules: list[RuleIn]


class RuleWriteResult(BaseModel):
    inserted: int
    skipped: int


class RuleOut(BaseModel):
    id: int
    rule_code: str
    version: str
    name: str
    logic: Optional[str]
    dimension_code: str
    dimension_name: str
    decision_type: str
    disposition: str
    binding_class: str
    source_clause_id: Optional[int]
    clause_no: Optional[str]
    clause_text: Optional[str]
    page_no: Optional[int]
    locator: Optional[Any]
