from __future__ import annotations

from sqlalchemy import delete, distinct, func, select
from sqlmodel import Session

from .materials import ensure_default_master_data
from .models import (ApplicationPackage, BatchRuleDoc, ProjectType, RegulationClause,
                     ReviewBatch, ReviewRule, ReviewRuleClause, ReviewRuleVersion,
                     ReviewStage, StandardDoc)
from .schemas import BatchCreateIn, BatchOut


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


def list_batches(db: Session) -> list[BatchOut]:
    """返回全部批次（含 __DEFAULT_BATCH__），带聚合计数。"""
    # 1. 批次基本信息 + project_type/stage 名称
    batch_rows = db.execute(
        select(
            ReviewBatch.id,
            ReviewBatch.batch_no,
            ReviewBatch.status,
            ReviewBatch.declare_period,
            ProjectType.name,
            ReviewStage.name,
        )
        .join(ProjectType, ProjectType.id == ReviewBatch.project_type_id)
        .join(ReviewStage, ReviewStage.id == ReviewBatch.stage_id)
        .order_by(ReviewBatch.id)
    ).all()

    # 2. 申报包数量（排除软删除）
    mat_rows = db.execute(
        select(ApplicationPackage.batch_id, func.count(ApplicationPackage.id))
        .where(ApplicationPackage.deleted_at.is_(None))
        .group_by(ApplicationPackage.batch_id)
    ).all()
    mat_counts: dict[int, int] = {bid: cnt for bid, cnt in mat_rows}

    # 3. 绑定规则文件数
    doc_rows = db.execute(
        select(BatchRuleDoc.batch_id, func.count(BatchRuleDoc.id))
        .group_by(BatchRuleDoc.batch_id)
    ).all()
    doc_counts: dict[int, int] = {bid: cnt for bid, cnt in doc_rows}

    # 4. 有效规则数（口径与 config_packages 完全一致：同 join，is_active 双过滤，distinct review_rule.id）
    rule_rows = db.execute(
        select(
            BatchRuleDoc.batch_id,
            func.count(distinct(ReviewRule.id)),
        )
        .join(StandardDoc, StandardDoc.id == BatchRuleDoc.standard_doc_id)
        .join(RegulationClause, RegulationClause.standard_doc_id == StandardDoc.id)
        .join(ReviewRuleClause, ReviewRuleClause.clause_id == RegulationClause.id)
        .join(ReviewRuleVersion, ReviewRuleVersion.id == ReviewRuleClause.rule_version_id)
        .join(ReviewRule, ReviewRule.current_version_id == ReviewRuleVersion.id)
        .where(StandardDoc.is_active == True, ReviewRule.is_active == True)  # noqa: E712
        .group_by(BatchRuleDoc.batch_id)
    ).all()
    rule_counts: dict[int, int] = {bid: cnt for bid, cnt in rule_rows}

    return [
        BatchOut(
            id=bid,
            batch_no=batch_no,
            project_type_name=pt_name,
            stage_name=stage_name,
            status=status,
            declare_period=declare_period,
            material_count=mat_counts.get(bid, 0),
            rule_doc_count=doc_counts.get(bid, 0),
            rule_count=rule_counts.get(bid, 0),
        )
        for bid, batch_no, status, declare_period, pt_name, stage_name in batch_rows
    ]


def create_batch(db: Session, body: BatchCreateIn) -> BatchOut:
    """新建审查批次。batch_no 空 → ValueError；已存在 → ValueError。"""
    batch_no = (body.batch_no or "").strip()
    if not batch_no:
        raise ValueError("批次号不能为空")

    existing = db.execute(
        select(ReviewBatch.id).where(ReviewBatch.batch_no == batch_no)
    ).first()
    if existing is not None:
        raise ValueError(f"批次号已存在: {batch_no}")

    refs = ensure_default_master_data(db)

    batch = ReviewBatch(
        batch_no=batch_no,
        project_type_id=refs.project_type_id,
        stage_id=refs.stage_id,
        created_by=refs.sys_user_id,
        status="reviewing",
        declare_period=body.declare_period,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    pt = db.get(ProjectType, batch.project_type_id)
    stage = db.get(ReviewStage, batch.stage_id)

    return BatchOut(
        id=batch.id,
        batch_no=batch.batch_no,
        project_type_name=pt.name if pt else "",
        stage_name=stage.name if stage else "",
        status=batch.status,
        declare_period=batch.declare_period,
        material_count=0,
        rule_doc_count=0,
        rule_count=0,
    )
