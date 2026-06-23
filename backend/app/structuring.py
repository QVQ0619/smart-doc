from __future__ import annotations

import uuid

from sqlalchemy import delete, select, update
from sqlmodel import Session

from .models import (RegulationClause, ReviewDimension, ReviewRule,
                     ReviewRuleClause, ReviewRuleVersion)
from .schemas import RuleIn, RuleWriteResult

_DECISION = {"hard", "verify", "soft"}
_DISPOSITION = {"reject", "fix", "review"}
_BINDING = {"common", "parameterized", "specific"}


def replace_rules(db: Session, doc_id: int, rules: list[RuleIn]) -> RuleWriteResult:
    """按文档幂等替换该文档的 review_rule(1:1 升格)。
    经 review_rule_clause→regulation_clause 反查该文档既有 rule，删后重建。
    非法 source_clause_id/维度/枚举/空名 → 跳过计 skipped。单次 commit。"""
    valid_clause_ids = set(
        db.execute(
            select(RegulationClause.id).where(RegulationClause.standard_doc_id == doc_id)
        ).scalars().all()
    )

    # —— 删旧：反查该文档关联的 rule_version → rule ——
    old_version_ids = set(
        db.execute(
            select(ReviewRuleClause.rule_version_id)
            .join(RegulationClause, ReviewRuleClause.clause_id == RegulationClause.id)
            .where(RegulationClause.standard_doc_id == doc_id)
        ).scalars().all()
    )
    old_rule_ids = set(
        db.execute(
            select(ReviewRuleVersion.rule_id).where(ReviewRuleVersion.id.in_(old_version_ids))
        ).scalars().all()
    ) if old_version_ids else set()
    if old_rule_ids:
        # 先断开循环 FK，否则删 review_rule 受 current_version_id 阻塞
        db.execute(update(ReviewRule).where(ReviewRule.id.in_(old_rule_ids)).values(current_version_id=None))
    if old_version_ids:
        db.execute(delete(ReviewRuleClause).where(ReviewRuleClause.rule_version_id.in_(old_version_ids)))
        db.execute(delete(ReviewRuleVersion).where(ReviewRuleVersion.id.in_(old_version_ids)))
    if old_rule_ids:
        db.execute(delete(ReviewRule).where(ReviewRule.id.in_(old_rule_ids)))

    dim_map = dict(db.execute(select(ReviewDimension.code, ReviewDimension.id)).all())

    inserted = 0
    skipped = 0
    for r in rules:
        if (r.source_clause_id not in valid_clause_ids
                or r.dimension_code not in dim_map
                or r.decision_type not in _DECISION
                or r.disposition not in _DISPOSITION
                or r.binding_class not in _BINDING
                or not (r.name or "").strip()):
            skipped += 1
            continue
        rule = ReviewRule(rule_code="RULE-" + uuid.uuid4().hex[:12], current_version_id=None)
        db.add(rule)
        db.flush()
        ver = ReviewRuleVersion(
            rule_id=rule.id, version="V1.0", dimension_id=dim_map[r.dimension_code],
            name=r.name, logic=r.logic, decision_type=r.decision_type,
            disposition=r.disposition, binding_class=r.binding_class,
        )
        db.add(ver)
        db.flush()
        rule.current_version_id = ver.id
        db.add(ReviewRuleClause(rule_version_id=ver.id, clause_id=r.source_clause_id))
        inserted += 1

    db.commit()
    return RuleWriteResult(inserted=inserted, skipped=skipped)
