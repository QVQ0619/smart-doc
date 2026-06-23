from __future__ import annotations

from sqlalchemy import delete, select
from sqlmodel import Session

from .models import (ParseSegment, RegulationClause, ReviewRuleClause,
                     ReviewRuleVersion, StandardDoc)
from .schemas import ClauseIn, ClauseWriteResult
from .structuring import delete_rule_cascade, delete_rules_for_doc


def replace_clauses(db: Session, doc_id: int, clauses: list[ClauseIn]) -> ClauseWriteResult:
    sd = db.get(StandardDoc, doc_id)
    if sd is None:
        # fail-fast：doc 不存在时直接报错，不静默写空 doc_code、不执行下方 delete（避免误删）。
        # 正常路径由路由 404 守卫保证 sd 存在；此处防御绕过路由的服务调用方。
        raise ValueError(f"standard_doc {doc_id} 不存在")
    doc_code = sd.doc_code
    valid_ids = set(
        db.execute(select(ParseSegment.id).where(ParseSegment.standard_doc_id == doc_id)).scalars().all()
    )
    # 先级联清掉基于这些条款的 review_rule(否则 fk_rvc_clause 阻塞下方删除)，再删旧条款
    delete_rules_for_doc(db, doc_id)
    db.execute(delete(RegulationClause).where(RegulationClause.standard_doc_id == doc_id))
    inserted = 0
    missing = 0
    for c in clauses:
        seg_id = c.source_segment_id
        if seg_id is None or seg_id not in valid_ids:
            seg_id = None
            missing += 1
        db.add(RegulationClause(
            standard_doc_id=doc_id,
            doc_code=doc_code,
            clause_no=c.clause_no,
            clause_text=c.clause_text,
            source_segment_id=seg_id,
        ))
        inserted += 1
    db.commit()
    return ClauseWriteResult(inserted=inserted, missing_provenance=missing)


def update_clause(db: Session, doc_id: int, clause_id: int, clause_no: str,
                  clause_text: str | None) -> RegulationClause:
    """原地改条款的条号/条文。不归属该文档 → LookupError(404);空条号 → ValueError(422)。"""
    rc = db.get(RegulationClause, clause_id)
    if rc is None or rc.standard_doc_id != doc_id:
        raise LookupError(f"clause {clause_id} not in doc {doc_id}")
    if not (clause_no or "").strip():
        raise ValueError("clause_no 不能为空")
    rc.clause_no = clause_no
    rc.clause_text = clause_text
    db.add(rc)
    db.commit()
    db.refresh(rc)
    return rc


def delete_clause(db: Session, doc_id: int, clause_id: int) -> None:
    """删条款;若被 review_rule 关联,连带删除该规则全套(避免 list_rules inner join 出幽灵)。"""
    rc = db.get(RegulationClause, clause_id)
    if rc is None or rc.standard_doc_id != doc_id:
        raise LookupError(f"clause {clause_id} not in doc {doc_id}")
    version_ids = set(
        db.execute(
            select(ReviewRuleClause.rule_version_id).where(ReviewRuleClause.clause_id == clause_id)
        ).scalars().all()
    )
    rule_ids = set(
        db.execute(
            select(ReviewRuleVersion.rule_id).where(ReviewRuleVersion.id.in_(version_ids))
        ).scalars().all()
    ) if version_ids else set()
    delete_rule_cascade(db, rule_ids)
    db.delete(rc)
    db.commit()
