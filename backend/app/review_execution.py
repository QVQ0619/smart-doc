from __future__ import annotations

from sqlalchemy import delete, func, insert, null, select
from sqlmodel import Session

from .material_extraction import build_package_segments, build_package_structured
from .materials import ensure_default_master_data
from .models import (ApplicationPackage, ConfigPackage, ConfigRuleVersion, RegulationClause,
                     ReviewBatch, ReviewDimension, ReviewRule, ReviewRuleClause,
                     ReviewRuleVersion, StandardDoc)
from .schemas import ReviewInput, ReviewRuleInfo


class ConflictError(Exception):
    """乐观锁冲突 → HTTP 409。"""


def materialize_config(db: Session, config_doc_id: int) -> int:
    """把某规则文件(standard_doc)派生的规则集物化为 config_package + config_rule_version。
    幂等(按 code 去重,重建 config_rule_version)。doc 不存在/未启用/无规则 → ValueError。返回 config_id。"""
    doc = db.get(StandardDoc, config_doc_id)
    if doc is None or not doc.is_active:
        raise ValueError(f"standard_doc {config_doc_id} 不存在或未启用")
    rule_version_ids = list(db.execute(
        select(ReviewRuleVersion.id)
        .join(ReviewRuleClause, ReviewRuleClause.rule_version_id == ReviewRuleVersion.id)
        .join(RegulationClause, ReviewRuleClause.clause_id == RegulationClause.id)
        .join(ReviewRule, ReviewRule.current_version_id == ReviewRuleVersion.id)
        .where(RegulationClause.standard_doc_id == config_doc_id, ReviewRule.is_active == True)  # noqa: E712
        .distinct()
    ).scalars().all())
    if not rule_version_ids:
        raise ValueError(f"规则文件 {config_doc_id} 无有效规则,无法物化配置包")
    refs = ensure_default_master_data(db)
    code = f"CFG-{doc.doc_code}"
    cfg = db.execute(select(ConfigPackage).where(ConfigPackage.code == code)).scalars().first()
    if cfg is None:
        # 用 null() 显式传 SQL NULL，绕过 SQLModel 将 JSON 列 Python None 序列化为
        # 字符串 'null' 的已知问题（MySQL chk_cp_flow/chk_cp_weight 要求 IS NULL 或合法 JSON 对象）
        result = db.execute(
            insert(ConfigPackage).values(
                code=code, project_type_id=refs.project_type_id, stage_id=refs.stage_id,
                name=doc.title, version="V1.0", status="active",
                dimension_weight=null(), flow_config=null(),
            )
        )
        db.flush()
        cfg = db.get(ConfigPackage, result.lastrowid)
    db.execute(delete(ConfigRuleVersion).where(ConfigRuleVersion.config_id == cfg.id))
    for rvid in rule_version_ids:
        db.add(ConfigRuleVersion(config_id=cfg.id, rule_version_id=rvid))
    db.commit()
    return cfg.id


def _hard_rule_version_ids(db: Session, config_id: int) -> set[int]:
    return set(db.execute(
        select(ConfigRuleVersion.rule_version_id)
        .join(ReviewRuleVersion, ReviewRuleVersion.id == ConfigRuleVersion.rule_version_id)
        .where(ConfigRuleVersion.config_id == config_id, ReviewRuleVersion.decision_type == "hard")
    ).scalars().all())


def bind_package_config(db: Session, package_id: int, config_doc_id: int) -> tuple[int, int]:
    """物化 config 并绑到该包的批次。共享默认 batch → 新建专属 batch 并改 package.batch_id。
    包不存在 → LookupError。返回 (config_id, hard 规则数)。"""
    pkg = db.get(ApplicationPackage, package_id)
    if pkg is None:
        raise LookupError(f"application_package {package_id} not found")
    config_id = materialize_config(db, config_doc_id)
    batch = db.get(ReviewBatch, pkg.batch_id)
    if batch is None:
        raise LookupError(f"application_package {package_id} 未关联批次")
    if batch.batch_no == "__DEFAULT_BATCH__":
        pkg_batch_no = f"BATCH-PKG{package_id}"
        dedicated = db.execute(select(ReviewBatch).where(ReviewBatch.batch_no == pkg_batch_no)).scalars().first()
        if dedicated is None:
            dedicated = ReviewBatch(batch_no=pkg_batch_no, project_type_id=batch.project_type_id,
                                    stage_id=batch.stage_id, created_by=batch.created_by, status="reviewing")
            db.add(dedicated)
            db.flush()
        pkg.batch_id = dedicated.id
        batch = dedicated
    batch.config_id = config_id
    db.add(batch)
    db.add(pkg)
    db.commit()
    rule_count = len(_hard_rule_version_ids(db, config_id))
    return config_id, rule_count


def get_review_input(db: Session, package_id: int) -> ReviewInput:
    """组装 agent 判定输入:该包 config 下 hard 规则 + 结构化数据 + 段落。
    包不存在 → LookupError;未绑 config → ValueError。"""
    pkg = db.get(ApplicationPackage, package_id)
    if pkg is None:
        raise LookupError(f"application_package {package_id} not found")
    config_id = None
    if pkg.batch_id is not None:
        batch = db.get(ReviewBatch, pkg.batch_id)
        config_id = batch.config_id if batch is not None else None
    if config_id is None:
        raise ValueError("该申报包未绑定配置包,请先 bind-config")
    rows = db.execute(
        select(ReviewRuleVersion, ReviewRule, ReviewDimension)
        .join(ConfigRuleVersion, ConfigRuleVersion.rule_version_id == ReviewRuleVersion.id)
        .join(ReviewRule, ReviewRule.current_version_id == ReviewRuleVersion.id)
        .join(ReviewDimension, ReviewDimension.id == ReviewRuleVersion.dimension_id)
        .where(ConfigRuleVersion.config_id == config_id,
               ReviewRuleVersion.decision_type == "hard",
               ReviewRule.is_active == True)  # noqa: E712
        .order_by(ReviewRuleVersion.id)
    ).all()
    rules: list[ReviewRuleInfo] = []
    for rv, rule, dim in rows:
        clause = db.execute(
            select(RegulationClause)
            .join(ReviewRuleClause, ReviewRuleClause.clause_id == RegulationClause.id)
            .where(ReviewRuleClause.rule_version_id == rv.id)
            .order_by(RegulationClause.id)
        ).scalars().first()
        rules.append(ReviewRuleInfo(
            rule_version_id=rv.id, rule_code=rule.rule_code, name=rv.name, logic=rv.logic,
            dimension_code=dim.code, dimension_name=dim.name, disposition=rv.disposition,
            clause_no=(clause.clause_no if clause else None),
            clause_text=(clause.clause_text if clause else None)))
    structured = build_package_structured(db, package_id)
    return ReviewInput(
        config_id=config_id, package_id=package_id, rules=rules,
        members=structured.members, coop_units=structured.coop_units,
        budget_items=structured.budget_items, attachments=structured.attachments,
        fields=structured.fields, segments=build_package_segments(db, package_id))
