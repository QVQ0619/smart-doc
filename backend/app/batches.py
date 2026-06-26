from __future__ import annotations

from sqlalchemy import delete, select
from sqlmodel import Session

from .models import BatchRuleDoc, ReviewBatch, StandardDoc


def bind_rule_docs(db: Session, batch_id: int, doc_ids: list[int]) -> int:
    """幂等地把 batch 绑定到给定规则文件集合:先清空该批次原绑定,再按去重后的 doc_ids 重建。
    返回最终绑定条数。空列表 = 解绑全部。
    batch 不存在 → LookupError;任一 doc 不存在 → LookupError。"""
    if db.get(ReviewBatch, batch_id) is None:
        raise LookupError(f"批次不存在: {batch_id}")
    uniq = list(dict.fromkeys(doc_ids))  # 去重保序
    for did in uniq:
        if db.get(StandardDoc, did) is None:
            raise LookupError(f"规则文件不存在: {did}")
    db.execute(delete(BatchRuleDoc).where(BatchRuleDoc.batch_id == batch_id))
    for did in uniq:
        db.add(BatchRuleDoc(batch_id=batch_id, standard_doc_id=did))
    db.commit()
    return len(uniq)


def list_batch_rule_docs(db: Session, batch_id: int) -> list[int]:
    """返回该批次绑定的 standard_doc_id 列表(按 id 升序)。"""
    rows = db.execute(
        select(BatchRuleDoc.standard_doc_id)
        .where(BatchRuleDoc.batch_id == batch_id)
        .order_by(BatchRuleDoc.standard_doc_id)
    ).all()
    return [r[0] for r in rows]
