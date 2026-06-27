from __future__ import annotations

from sqlalchemy import delete, distinct, func, select
from sqlmodel import Session

from .materials import ensure_default_master_data
from .models import (ApplicationPackage, BatchRuleDoc, FileObject, ProjectType,
                     RegulationClause, ReviewBatch, ReviewRule, ReviewRuleClause,
                     ReviewRuleVersion, ReviewStage, StandardDoc)
from .schemas import BatchCreateIn, BatchDetailOut, BatchOut, StandardDocOut


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


def unbind_rule_doc(db: Session, batch_id: int, doc_id: int) -> bool:
    """解除单个规则文件与批次的绑定（只删 batch_rule_doc 一行）。
    删到返回 True；该关联不存在返回 False。不触碰 StandardDoc 及派生数据。"""
    res = db.execute(
        delete(BatchRuleDoc).where(
            BatchRuleDoc.batch_id == batch_id,
            BatchRuleDoc.standard_doc_id == doc_id,
        )
    )
    db.commit()
    return res.rowcount > 0


def _batch_to_out(db: Session, batch: ReviewBatch) -> BatchOut:
    """把单个 ReviewBatch 行组装成 BatchOut（含三个聚合计数）。
    list_batches 与 get_batch_detail 共用此函数，保证计数口径一致。"""
    pt = db.get(ProjectType, batch.project_type_id)
    stage = db.get(ReviewStage, batch.stage_id)

    mat_count: int = db.execute(
        select(func.count(ApplicationPackage.id))
        .where(ApplicationPackage.batch_id == batch.id,
               ApplicationPackage.deleted_at.is_(None))
    ).scalar_one()

    doc_count: int = db.execute(
        select(func.count(BatchRuleDoc.id))
        .where(BatchRuleDoc.batch_id == batch.id)
    ).scalar_one()

    # 有效规则数：口径与 config_packages 完全一致（is_active 双过滤，distinct review_rule.id）
    rule_count: int = db.execute(
        select(func.count(distinct(ReviewRule.id)))
        .select_from(BatchRuleDoc)
        .join(StandardDoc, StandardDoc.id == BatchRuleDoc.standard_doc_id)
        .join(RegulationClause, RegulationClause.standard_doc_id == StandardDoc.id)
        .join(ReviewRuleClause, ReviewRuleClause.clause_id == RegulationClause.id)
        .join(ReviewRuleVersion, ReviewRuleVersion.id == ReviewRuleClause.rule_version_id)
        .join(ReviewRule, ReviewRule.current_version_id == ReviewRuleVersion.id)
        .where(
            BatchRuleDoc.batch_id == batch.id,
            StandardDoc.is_active == True,   # noqa: E712
            ReviewRule.is_active == True,    # noqa: E712
        )
    ).scalar_one()

    return BatchOut(
        id=batch.id,
        batch_no=batch.batch_no,
        project_type_name=pt.name if pt else "",
        stage_name=stage.name if stage else "",
        status=batch.status,
        declare_period=batch.declare_period,
        material_count=mat_count,
        rule_doc_count=doc_count,
        rule_count=rule_count,
    )


def list_batches(db: Session) -> list[BatchOut]:
    """返回全部批次（含 __DEFAULT_BATCH__），带聚合计数。"""
    batches = db.execute(
        select(ReviewBatch)
        .join(ProjectType, ProjectType.id == ReviewBatch.project_type_id)
        .join(ReviewStage, ReviewStage.id == ReviewBatch.stage_id)
        .order_by(ReviewBatch.id)
    ).scalars().all()
    return [_batch_to_out(db, b) for b in batches]


def create_batch(db: Session, body: BatchCreateIn) -> BatchOut:
    """新建审查批次。batch_no 空 → ValueError；已存在 → ValueError。"""
    batch_no = (body.batch_no or "").strip()
    if not batch_no:
        raise ValueError("批次号不能为空")

    # ensure_default_master_data 必须先于 batch_no 查重执行：
    # 它会幂等地建出 __DEFAULT_BATCH__（并 commit），后续查重才能覆盖到该 sentinel，
    # 从而在空库直接 POST batch_no="__DEFAULT_BATCH__" 时正确返回 ValueError→422 而非 500。
    refs = ensure_default_master_data(db)

    existing = db.execute(
        select(ReviewBatch.id).where(ReviewBatch.batch_no == batch_no)
    ).first()
    if existing is not None:
        raise ValueError(f"批次号已存在: {batch_no}")

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


def list_batch_standard_docs(db: Session, batch_id: int) -> list[StandardDocOut]:
    """返回该批次绑定的规则文件列表（StandardDocOut），口径同 standard_docs.list_standard_docs：
    join FileObject，is_active & deleted_at IS NULL，按 created_at desc, id desc 排序。
    绑定为空 → []。
    额外填充 clause_count / rule_count（rule_count 口径与 config_packages 一致）。"""
    doc_ids = list_batch_rule_docs(db, batch_id)
    if not doc_ids:
        return []
    rows = db.execute(
        select(StandardDoc, FileObject)
        .join(FileObject, StandardDoc.file_id == FileObject.id)
        .where(
            StandardDoc.id.in_(doc_ids),
            StandardDoc.is_active == True,    # noqa: E712
            FileObject.deleted_at == None,    # noqa: E711
        )
        .order_by(StandardDoc.created_at.desc(), StandardDoc.id.desc())
    ).all()

    # clause_count：每 doc 的 RegulationClause 行数（一次批量查询）
    clause_rows = db.execute(
        select(RegulationClause.standard_doc_id, func.count(RegulationClause.id))
        .where(RegulationClause.standard_doc_id.in_(doc_ids))
        .group_by(RegulationClause.standard_doc_id)
    ).all()
    clause_map: dict[int, int] = {r[0]: r[1] for r in clause_rows}

    # rule_count：口径与 config_packages.list_config_packages 完全一致
    # （StandardDoc→RegulationClause→ReviewRuleClause→ReviewRuleVersion→ReviewRule，
    #   is_active 双过滤，distinct review_rule.id，按 doc 分组）
    rule_rows = db.execute(
        select(StandardDoc.id, func.count(distinct(ReviewRule.id)))
        .join(RegulationClause, RegulationClause.standard_doc_id == StandardDoc.id)
        .join(ReviewRuleClause, ReviewRuleClause.clause_id == RegulationClause.id)
        .join(ReviewRuleVersion, ReviewRuleVersion.id == ReviewRuleClause.rule_version_id)
        .join(ReviewRule, ReviewRule.current_version_id == ReviewRuleVersion.id)
        .where(
            StandardDoc.id.in_(doc_ids),
            StandardDoc.is_active == True,   # noqa: E712
            ReviewRule.is_active == True,    # noqa: E712
        )
        .group_by(StandardDoc.id)
    ).all()
    rule_map: dict[int, int] = {r[0]: r[1] for r in rule_rows}

    return [
        StandardDocOut(
            id=sd.id,
            doc_code=sd.doc_code,
            title=sd.title,
            file_name=fo.file_name,
            size_bytes=fo.size_bytes,
            mime_type=fo.mime_type,
            created_at=sd.created_at,
            recognition_status=sd.recognition_status,
            clause_count=clause_map.get(sd.id, 0),
            rule_count=rule_map.get(sd.id, 0),
        )
        for sd, fo in rows
    ]


def get_batch_detail(db: Session, batch_id: int) -> BatchDetailOut:
    """返回批次详情（元信息 + 绑定规则文件列表）。批次不存在 → LookupError。"""
    batch = db.get(ReviewBatch, batch_id)
    if batch is None:
        raise LookupError(f"批次不存在: {batch_id}")
    base = _batch_to_out(db, batch)
    rule_docs = list_batch_standard_docs(db, batch_id)
    return BatchDetailOut(
        **base.model_dump(),
        rule_docs=rule_docs,
    )
