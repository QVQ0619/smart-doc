from __future__ import annotations

from datetime import datetime
from typing import Callable

from sqlmodel import Session

from .models import (ApplicationPackage, DeclaredProject, ResearchPerson,
                     ResearchUnit, ReviewBatch, MaterialFile, ParseSegment)
from .reporting.model import (AuditTrail, DimensionStat, EvidenceRef, Finding,
                              ReportModel, Section)
from .reporting.styles import (CONCLUSION_LABELS, DIMENSION_ORDER, dimension_label,
                               result_bucket, result_label)
from .review_execution import get_review_results
from .schemas import CheckOut, EvidenceOut, ReviewResultOut

TITLE = "立项审查报告"
FOOTER = "智能立项审查系统 生成"


def _finding_of(c: CheckOut, resolve_evidence: Callable[[EvidenceOut], EvidenceRef]) -> Finding:
    audit = None
    if c.status == "overruled":   # 仅人工改判才有审计留痕；confirm 沿用初判不算
        audit = AuditTrail(initial=result_label(c.initial_result),
                           final=result_label(c.final_result or c.initial_result),
                           disposition=c.final_disposition or "—")
    return Finding(
        result_label=result_label(c.effective_result),
        result_key=c.effective_result,
        rule_code=c.rule_code, name=c.name,
        severity=c.severity, confidence=c.confidence,
        suggestion=c.suggestion or "",
        evidence=[resolve_evidence(e) for e in c.evidence],
        audit=audit,
    )


def assemble_report_model(*, title: str, cover: list[tuple[str, str]],
                          review_result: ReviewResultOut,
                          resolve_evidence: Callable[[EvidenceOut], EvidenceRef]) -> ReportModel:
    checks = review_result.checks
    # 分维度分组，按 DIMENSION_ORDER 排序，只保留有发现的维度
    by_dim: dict[str, list[CheckOut]] = {}
    for c in checks:
        by_dim.setdefault(c.dimension_code, []).append(c)

    sections: list[Section] = []
    dimension_stats: list[DimensionStat] = []
    n_pass = n_fail = n_att = 0
    for code in DIMENSION_ORDER:
        group = by_dim.get(code, [])
        if not group:
            continue
        p = sum(1 for c in group if result_bucket(c.effective_result) == "passed")
        f = sum(1 for c in group if result_bucket(c.effective_result) == "failed")
        a = sum(1 for c in group if result_bucket(c.effective_result) == "attention")
        n_pass += p; n_fail += f; n_att += a
        dimension_stats.append(DimensionStat(dimension_label=dimension_label(code),
                                             passed=p, failed=f, attention=a))
        sections.append(Section(dimension_label=dimension_label(code),
                                findings=[_finding_of(c, resolve_evidence) for c in group]))

    conclusion_code = review_result.round.conclusion if review_result.round else "pending"
    conclusion_label = CONCLUSION_LABELS.get(conclusion_code, conclusion_code)
    conclusion_text = (f"共审查规则 {len(checks)} 条，通过 {n_pass}、不通过 {n_fail}、"
                       f"需关注 {n_att}。综合结论：{conclusion_label}")

    return ReportModel(title=title, cover=cover, conclusion_text=conclusion_text,
                       dimension_stats=dimension_stats, sections=sections, footer_note=FOOTER)


def _cover_fields(db: Session, pkg: ApplicationPackage, conclusion_code: str) -> list[tuple[str, str]]:
    dash = "—"
    project_name = unit_name = person_name = batch_no = dash
    proj = db.get(DeclaredProject, pkg.declared_project_id) if pkg.declared_project_id else None
    if proj is not None:
        project_name = proj.project_name or dash
        unit = db.get(ResearchUnit, proj.declaring_unit_id) if proj.declaring_unit_id else None
        if unit is not None:
            unit_name = unit.name or dash
        person = db.get(ResearchPerson, proj.applicant_person_id) if proj.applicant_person_id else None
        if person is not None:
            person_name = person.name or dash
    batch = db.get(ReviewBatch, pkg.batch_id) if pkg.batch_id else None
    if batch is not None:
        batch_no = batch.batch_no or dash
    return [
        ("项目名称", project_name),
        ("申报单位", unit_name),
        ("项目负责人", person_name),
        ("审查批次", batch_no),
        ("审查结论", CONCLUSION_LABELS.get(conclusion_code, conclusion_code)),
        ("报告生成时间", datetime.now().strftime("%Y-%m-%d %H:%M")),
    ]


def build_report_model(db: Session, package_id: int) -> ReportModel:
    pkg = db.get(ApplicationPackage, package_id)
    if pkg is None:
        raise LookupError(f"application_package {package_id} not found")
    rr = get_review_results(db, package_id)
    if rr.round is None:
        raise ValueError("该申报包尚未审查，无法导出报告")

    def resolve(e: EvidenceOut) -> EvidenceRef:
        if e.segment_id is not None:
            seg = db.get(ParseSegment, e.segment_id)
            if seg is not None:
                quote = (seg.content_text or "").strip()[:120] or "—"
                mf = db.get(MaterialFile, seg.material_file_id) if seg.material_file_id else None
                page = f"第{seg.page_no}页" if seg.page_no else ""
                loc = f"{mf.file_name if mf else '材料'}{('/' + page) if page else ''}"
                return EvidenceRef(quote=quote, locator=loc)
        if e.field_code:
            return EvidenceRef(quote=e.note or "—", locator=f"字段 {e.field_code}")
        return EvidenceRef(quote=e.note or "—", locator="—")

    cover = _cover_fields(db, pkg, rr.round.conclusion)
    return assemble_report_model(title=TITLE, cover=cover, review_result=rr,
                                 resolve_evidence=resolve)
