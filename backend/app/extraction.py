from __future__ import annotations

from sqlalchemy import delete, select
from sqlmodel import Session

from .models import ParseSegment, RegulationClause, StandardDoc
from .schemas import ClauseIn, ClauseWriteResult


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
