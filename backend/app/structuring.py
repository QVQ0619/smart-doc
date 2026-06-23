from __future__ import annotations

import uuid

from sqlalchemy import delete, select, update
from sqlmodel import Session

from .models import (ParseSegment, RegulationClause, ReviewDimension, ReviewRule,
                     ReviewRuleClause, ReviewRuleVersion, StandardDoc)
from .schemas import (ExtractRuleItemIn, ExtractRulesResult, RuleIn,
                      RuleWriteResult)

_DECISION = {"hard", "verify", "soft"}
_DISPOSITION = {"reject", "fix", "review"}
_BINDING = {"common", "parameterized", "specific"}


def delete_rules_for_doc(db: Session, doc_id: int) -> None:
    """删除该文档(经 review_rule_clause→regulation_clause 反查)关联的 review_rule 全套。
    循环 FK 序：断 current_version_id → 删 rule_clause → version → rule。不 commit，由调用方提交。"""
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


def replace_rules(db: Session, doc_id: int, rules: list[RuleIn]) -> RuleWriteResult:
    """按文档幂等替换该文档的 review_rule(1:1 升格)。
    经 review_rule_clause→regulation_clause 反查该文档既有 rule，删后重建。
    非法 source_clause_id/维度/枚举/空名 → 跳过计 skipped。单次 commit。"""
    valid_clause_ids = set(
        db.execute(
            select(RegulationClause.id).where(RegulationClause.standard_doc_id == doc_id)
        ).scalars().all()
    )

    # —— 删旧：清掉该文档既有的 review_rule 全套(复用 delete_rules_for_doc) ——
    delete_rules_for_doc(db, doc_id)

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


def extract_and_structure(db: Session, doc_id: int, items: list[ExtractRuleItemIn]) -> ExtractRulesResult:
    """一步抽取：原子地把每个 item(条款字段+规则字段)入 regulation_clause + review_rule(1:1)。
    按文档幂等替换(先清旧 rule cascade、再清旧 clause)。规则字段非法/空名/空条号 → 跳过整条。
    插 clause flush 拿 id → 插 rule+version+rule_clause(关联该 id)。单次 commit。"""
    sd = db.get(StandardDoc, doc_id)
    if sd is None:
        raise ValueError(f"standard_doc {doc_id} 不存在")
    doc_code = sd.doc_code
    valid_seg_ids = set(
        db.execute(select(ParseSegment.id).where(ParseSegment.standard_doc_id == doc_id)).scalars().all()
    )
    dim_map = dict(db.execute(select(ReviewDimension.code, ReviewDimension.id)).all())

    # 清旧：先 rule(cascade 复用)，再 clause
    delete_rules_for_doc(db, doc_id)
    db.execute(delete(RegulationClause).where(RegulationClause.standard_doc_id == doc_id))

    clauses_inserted = 0
    rules_inserted = 0
    skipped = 0
    missing_provenance = 0
    for it in items:
        if (it.dimension_code not in dim_map
                or it.decision_type not in _DECISION
                or it.disposition not in _DISPOSITION
                or it.binding_class not in _BINDING
                or not (it.name or "").strip()
                or not (it.clause_no or "").strip()):
            skipped += 1
            continue
        seg_id = it.source_segment_id
        if seg_id is None or seg_id not in valid_seg_ids:
            seg_id = None
            missing_provenance += 1
        clause = RegulationClause(
            standard_doc_id=doc_id, doc_code=doc_code,
            clause_no=it.clause_no, clause_text=it.clause_text, source_segment_id=seg_id,
        )
        db.add(clause)
        db.flush()  # 拿 clause.id
        clauses_inserted += 1
        rule = ReviewRule(rule_code="RULE-" + uuid.uuid4().hex[:12], current_version_id=None)
        db.add(rule)
        db.flush()
        ver = ReviewRuleVersion(
            rule_id=rule.id, version="V1.0", dimension_id=dim_map[it.dimension_code],
            name=it.name, logic=it.logic, decision_type=it.decision_type,
            disposition=it.disposition, binding_class=it.binding_class,
        )
        db.add(ver)
        db.flush()
        rule.current_version_id = ver.id
        db.add(ReviewRuleClause(rule_version_id=ver.id, clause_id=clause.id))
        rules_inserted += 1
    db.commit()
    return ExtractRulesResult(
        clauses_inserted=clauses_inserted, rules_inserted=rules_inserted,
        skipped=skipped, missing_provenance=missing_provenance,
    )
