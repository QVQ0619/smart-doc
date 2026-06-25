from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import delete, select
from sqlmodel import Session

from .materials import ensure_default_form_template
from .models import (ApplicationPackage, BudgetItem, DeclaredProject, ExtractedField,
                     FormField, MaterialFile, PackageAttachment, PackageCoopUnit,
                     PackageMember, ParseSegment)
from .schemas import MaterialExtractPayload, MaterialExtractResult

_MEMBER_ROLE = {"applicant", "participant"}
_COOP_TYPE = {"联合承研", "合作单位"}
_BUDGET_CAT = {"设备费", "业务费", "劳务费", "间接费", "管理费"}
_ATTACH_TYPE = {"推荐信", "导师同意函", "知情同意书", "伦理证明", "聘任合同",
                "标准初稿", "技术成熟度报告", "社科结项证书", "其他"}
_EXTRACT_STATUS = {"ok", "missing", "uncertain"}
ROUND_NO = 1


def _parse_date(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def _to_decimal(x):
    if x is None:
        return None
    try:
        return Decimal(str(x))
    except (InvalidOperation, ValueError, TypeError):
        return None


def replace_package_extraction(db: Session, package_id: int,
                               payload: MaterialExtractPayload) -> MaterialExtractResult:
    """幂等替换该审查包(round_no=1)的五类结构化抽取。
    包不存在 → LookupError；source_segment_id 不属本包 / 枚举越界 → ValueError。"""
    pkg = db.get(ApplicationPackage, package_id)
    if pkg is None:
        raise LookupError(f"application_package {package_id} not found")

    # 本包合法 segment id（经 material_file 反查）
    valid_seg_ids = set(db.execute(
        select(ParseSegment.id).join(MaterialFile, ParseSegment.material_file_id == MaterialFile.id)
        .where(MaterialFile.package_id == package_id)
    ).scalars().all())

    # —— 全量前置校验（任何越界都不落库）——
    all_rows = (*payload.members, *payload.coop_units, *payload.budget_items,
                *payload.attachments, *payload.fields)
    for r in all_rows:
        sid = r.source_segment_id
        if sid is not None and sid not in valid_seg_ids:
            raise ValueError(f"source_segment_id {sid} 不属于审查包 {package_id}")
    for m in payload.members:
        if m.member_role not in _MEMBER_ROLE:
            raise ValueError(f"member_role 非法: {m.member_role}")
    for c in payload.coop_units:
        if c.coop_type not in _COOP_TYPE:
            raise ValueError(f"coop_type 非法: {c.coop_type}")
    for b in payload.budget_items:
        if b.category not in _BUDGET_CAT:
            raise ValueError(f"budget category 非法: {b.category}")
    for a in payload.attachments:
        if a.attachment_type not in _ATTACH_TYPE:
            raise ValueError(f"attachment_type 非法: {a.attachment_type}")
    for f in payload.fields:
        if f.extraction_status is not None and f.extraction_status not in _EXTRACT_STATUS:
            raise ValueError(f"extraction_status 非法: {f.extraction_status}")

    ensure_default_form_template(db)
    field_map = dict(db.execute(select(FormField.field_code, FormField.id)).all())

    # 幂等：清本包 round_no=1 旧行
    for model in (ExtractedField, PackageMember, PackageCoopUnit, BudgetItem, PackageAttachment):
        db.execute(delete(model).where(model.package_id == package_id, model.round_no == ROUND_NO))

    for m in payload.members:
        db.add(PackageMember(package_id=package_id, round_no=ROUND_NO, member_role=m.member_role,
                             name=m.name, title=m.title, birth_date=_parse_date(m.birth_date),
                             unit_name=m.unit_name, source_segment_id=m.source_segment_id))
    for c in payload.coop_units:
        db.add(PackageCoopUnit(package_id=package_id, round_no=ROUND_NO, coop_type=c.coop_type,
                               unit_name=c.unit_name, task_desc=c.task_desc,
                               applied_fund=_to_decimal(c.applied_fund),
                               source_segment_id=c.source_segment_id))
    for b in payload.budget_items:
        db.add(BudgetItem(package_id=package_id, round_no=ROUND_NO, category=b.category,
                          item_name=b.item_name, amount=_to_decimal(b.amount) or Decimal("0"),
                          is_subitem=False, parent_item_id=None,
                          source_segment_id=b.source_segment_id))
    for a in payload.attachments:
        db.add(PackageAttachment(package_id=package_id, round_no=ROUND_NO,
                                 attachment_type=a.attachment_type, is_present=a.is_present,
                                 source_segment_id=a.source_segment_id))
    skipped_fields = 0
    for f in payload.fields:
        fid = field_map.get(f.field_code)
        if fid is None:
            skipped_fields += 1
            continue
        db.add(ExtractedField(package_id=package_id, round_no=ROUND_NO, form_field_id=fid,
                              field_code_snapshot=f.field_code, field_value=f.field_value,
                              extraction_status=f.extraction_status or "ok",
                              source_segment_id=f.source_segment_id))

    # 轻升格：回填 declared_project.project_name
    if payload.project_name and payload.project_name.strip():
        dp = db.get(DeclaredProject, pkg.declared_project_id)
        if dp is not None:
            dp.project_name = payload.project_name.strip()
            db.add(dp)

    db.commit()
    return MaterialExtractResult(
        members=len(payload.members), coop_units=len(payload.coop_units),
        budget_items=len(payload.budget_items), attachments=len(payload.attachments),
        fields=len(payload.fields) - skipped_fields, skipped_fields=skipped_fields,
    )
