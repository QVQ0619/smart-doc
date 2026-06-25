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
    status: Optional[str] = None          # 上传场景: created | reused


class FailedItem(BaseModel):
    name: str
    reason: str


class ConflictItem(BaseModel):
    name: str                              # 本次上传的文件名
    existing_doc_code: str                 # 库中已有同名文档的 doc_code
    existing_title: str


class UploadResult(BaseModel):
    uploaded: list[StandardDocOut]
    failed: list[FailedItem]
    conflicts: list[ConflictItem] = []


class RecognizeResult(BaseModel):
    doc_id: int
    doc_code: str
    recognition_status: str          # processing | done | failed
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
    logic: Optional[str] = None
    dimension_code: str
    dimension_name: str
    decision_type: str
    disposition: str
    binding_class: str
    source_clause_id: Optional[int] = None
    clause_no: Optional[str] = None
    clause_text: Optional[str] = None
    page_no: Optional[int] = None
    locator: Optional[Any] = None


# —— 一步抽取：依据条款 + 审查规则 一次入库 ——
class ExtractRuleItemIn(BaseModel):
    # 条款字段
    clause_no: str
    clause_text: Optional[str] = None
    source_segment_id: Optional[int] = None
    # 规则字段
    dimension_code: str
    name: str
    logic: Optional[str] = None
    decision_type: str
    disposition: str
    binding_class: str


class ExtractRulesBatchIn(BaseModel):
    items: list[ExtractRuleItemIn]


class ExtractRulesResult(BaseModel):
    clauses_inserted: int
    rules_inserted: int
    skipped: int
    missing_provenance: int


class ClauseUpdateIn(BaseModel):
    clause_no: str
    clause_text: Optional[str] = None


class RuleUpdateIn(BaseModel):
    name: str
    logic: Optional[str] = None
    dimension_code: str
    decision_type: str
    disposition: str
    binding_class: str


class ConfigPackageOut(BaseModel):
    doc_id: int
    doc_code: str
    title: str
    version: str
    rule_count: int
    dimensions: list[str]


class MaterialRecognizeResult(BaseModel):
    material_file_id: int
    recognition_status: str          # processing | done | failed
    segment_count: int
    page_count: Optional[int] = None
    error: Optional[str] = None


class MaterialItemOut(BaseModel):
    material_file_id: int
    file_name: str
    material_category: str
    recognition_status: str


class MaterialUploadResult(BaseModel):
    package_id: int
    items: list[MaterialItemOut]
    failed: list[FailedItem] = []


class MaterialFileBrief(BaseModel):
    material_file_id: int
    file_name: str
    material_category: str
    recognition_status: str
    segment_count: int


class MaterialPackageOut(BaseModel):
    package_id: int
    created_at: Optional[datetime] = None
    file_count: int
    files: list[MaterialFileBrief]


# —— 形式审查·结构化抽取 ——
class MemberIn(BaseModel):
    member_role: str
    name: str
    title: Optional[str] = None
    birth_date: Optional[str] = None          # ISO 日期串
    unit_name: Optional[str] = None
    source_segment_id: Optional[int] = None


class CoopUnitIn(BaseModel):
    coop_type: str
    unit_name: str
    task_desc: Optional[str] = None
    applied_fund: Optional[float] = None
    source_segment_id: Optional[int] = None


class BudgetItemIn(BaseModel):
    category: str
    item_name: str
    amount: float
    source_segment_id: Optional[int] = None


class AttachmentIn(BaseModel):
    attachment_type: str
    is_present: bool = False
    source_segment_id: Optional[int] = None


class FieldIn(BaseModel):
    field_code: str
    field_value: Optional[str] = None
    extraction_status: Optional[str] = None
    source_segment_id: Optional[int] = None


class MaterialExtractPayload(BaseModel):
    project_name: Optional[str] = None
    members: list[MemberIn] = []
    coop_units: list[CoopUnitIn] = []
    budget_items: list[BudgetItemIn] = []
    attachments: list[AttachmentIn] = []
    fields: list[FieldIn] = []


class MaterialExtractResult(BaseModel):
    members: int
    coop_units: int
    budget_items: int
    attachments: int
    fields: int
    skipped_fields: int


class MemberOut(BaseModel):
    id: int
    member_role: str
    name: str
    title: Optional[str]
    unit_name: Optional[str]
    source_segment_id: Optional[int]


class CoopUnitOut(BaseModel):
    id: int
    coop_type: str
    unit_name: str
    task_desc: Optional[str]
    applied_fund: Optional[float]
    source_segment_id: Optional[int]


class BudgetItemOut(BaseModel):
    id: int
    category: str
    item_name: str
    amount: float
    source_segment_id: Optional[int]


class AttachmentOut(BaseModel):
    id: int
    attachment_type: str
    is_present: bool
    source_segment_id: Optional[int]


class FieldOut(BaseModel):
    id: int
    field_code: str
    field_value: Optional[str]
    extraction_status: str
    source_segment_id: Optional[int]


class PackageStructuredOut(BaseModel):
    package_id: int
    members: list[MemberOut]
    coop_units: list[CoopUnitOut]
    budget_items: list[BudgetItemOut]
    attachments: list[AttachmentOut]
    fields: list[FieldOut]


class MaterialFileSegmentsOut(BaseModel):
    material_file_id: int
    file_name: str
    segments: list[SegmentOut]


# —— 形式审查·审查执行(C) ——
class BindConfigIn(BaseModel):
    config_doc_id: int


class BindConfigResult(BaseModel):
    config_id: int
    rule_count: int
