from __future__ import annotations

from decimal import Decimal

from sqlalchemy import delete, func, insert, null, select
from sqlmodel import Session

from .material_extraction import build_package_segments, build_package_structured
from .materials import ensure_default_master_data
from .models import (ApplicationPackage, BudgetItem, ConfigPackage, ConfigRuleVersion,
                     FindingEvidence, MaterialFile, ParseSegment, RegulationClause,
                     ReviewBatch, ReviewDimension, ReviewRule, ReviewRuleClause,
                     ReviewRound, ReviewRuleVersion, RoundCheck, StandardDoc)
from .schemas import (CheckOut, EvidenceOut, ReviewApplyIn, ReviewApplyResult,
                      ReviewInput, ReviewResultOut, ReviewRuleInfo, RoundOut)


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


# =========================================================================== #
# Task 3: 机审落库 — 聚合 + apply_review + get_review_results
# =========================================================================== #

_RESULTS = {"pending", "pass", "fail", "need_review", "not_applicable", "error"}
_DISPOSITIONS = {"reject", "fix", "review"}


def aggregate_conclusion(db: Session, round_id: int) -> str:
    """按各 check 的 effective(final 优先) 聚合 round 结论。"""
    rows = db.execute(
        select(RoundCheck.initial_result, RoundCheck.initial_disposition,
               RoundCheck.final_result, RoundCheck.final_disposition)
        .where(RoundCheck.round_id == round_id)
    ).all()
    eff = []
    for ir, idisp, fr, fdisp in rows:
        if fr is not None:
            eff.append((fr, fdisp))
        else:
            eff.append((ir, idisp))
    if any(r == "fail" and d == "reject" for r, d in eff):
        return "reject"
    if any(r == "fail" for r, d in eff):
        return "fix"
    if any(r in ("need_review", "pending", "error") for r, d in eff):
        return "pending"
    return "accept"


def _package_segment_ids(db: Session, package_id: int) -> set[int]:
    return set(db.execute(
        select(ParseSegment.id).join(MaterialFile, ParseSegment.material_file_id == MaterialFile.id)
        .where(MaterialFile.package_id == package_id)
    ).scalars().all())


def _package_budget_ids(db: Session, package_id: int) -> set[int]:
    return set(db.execute(select(BudgetItem.id).where(BudgetItem.package_id == package_id)).scalars().all())


def apply_review(db: Session, package_id: int, payload: "ReviewApplyIn") -> "ReviewApplyResult":
    """机审落库:建/取 round,幂等替换 round_check(初判)+finding_evidence,聚合结论。
    包不存在→LookupError;未绑config/规则不属config hard集/枚举越界/evidence不属本包→ValueError。"""
    pkg = db.get(ApplicationPackage, package_id)
    if pkg is None:
        raise LookupError(f"application_package {package_id} not found")
    batch = db.get(ReviewBatch, pkg.batch_id)
    config_id = batch.config_id if batch is not None else None
    if config_id is None:
        raise ValueError("该申报包未绑定配置包,请先 bind-config")
    hard_ids = _hard_rule_version_ids(db, config_id)
    seg_ids = _package_segment_ids(db, package_id)
    budget_ids = _package_budget_ids(db, package_id)
    disp_map = dict(db.execute(
        select(ReviewRuleVersion.id, ReviewRuleVersion.disposition)
        .where(ReviewRuleVersion.id.in_(hard_ids) if hard_ids else select(ReviewRuleVersion.id).where(False))
    ).all()) if hard_ids else {}

    # —— 全量前置校验 ——
    for c in payload.checks:
        if c.rule_version_id not in hard_ids:
            raise ValueError(f"rule_version {c.rule_version_id} 不在该配置包的 hard 规则集")
        if c.initial_result not in _RESULTS:
            raise ValueError(f"initial_result 非法: {c.initial_result}")
        if c.initial_disposition is not None and c.initial_disposition not in _DISPOSITIONS:
            raise ValueError(f"initial_disposition 非法: {c.initial_disposition}")
        for e in c.evidence:
            if e.segment_id is not None and e.segment_id not in seg_ids:
                raise ValueError(f"evidence segment_id {e.segment_id} 不属于本包")
            if e.budget_item_id is not None and e.budget_item_id not in budget_ids:
                raise ValueError(f"evidence budget_item_id {e.budget_item_id} 不属于本包")

    rnd = db.execute(select(ReviewRound).where(ReviewRound.package_id == package_id,
                                               ReviewRound.round_no == 1)).scalars().first()
    if rnd is None:
        rnd = ReviewRound(package_id=package_id, round_no=1, conclusion="pending")
        db.add(rnd)
        db.flush()

    # —— 幂等:清该 round 旧 finding_evidence + round_check ——
    old_check_ids = list(db.execute(select(RoundCheck.id).where(RoundCheck.round_id == rnd.id)).scalars().all())
    if old_check_ids:
        db.execute(delete(FindingEvidence).where(FindingEvidence.round_check_id.in_(old_check_ids)))
        db.execute(delete(RoundCheck).where(RoundCheck.id.in_(old_check_ids)))

    evidence_written = 0
    for c in payload.checks:
        # 用 insert().values 显式传 null()，绕过 SQLModel 将 JSON 列 None 序列化为
        # 字符串 'null' 的已知问题（chk_rc_param 要求 IS NULL 或合法 JSON 对象）
        res = db.execute(
            insert(RoundCheck).values(
                round_id=rnd.id, rule_version_id=c.rule_version_id,
                applied_param_snapshot=null(),
                initial_result=c.initial_result,
                initial_disposition=(c.initial_disposition if c.initial_disposition is not None
                                     else disp_map.get(c.rule_version_id)),
                suggestion=c.suggestion,
                confidence=(Decimal(str(c.confidence)) if c.confidence is not None else None),
                severity=c.severity, status="open", version=0,
            )
        )
        db.flush()
        rc_id = res.lastrowid
        for e in c.evidence:
            db.add(FindingEvidence(round_check_id=rc_id, segment_id=e.segment_id,
                                   field_code=e.field_code, budget_item_id=e.budget_item_id, note=e.note))
            evidence_written += 1

    conclusion = aggregate_conclusion(db, rnd.id)
    rnd.conclusion = conclusion
    db.add(rnd)
    db.commit()
    return ReviewApplyResult(round_id=rnd.id, round_no=1, conclusion=conclusion,
                             checks_written=len(payload.checks), evidence_written=evidence_written)


def get_review_results(db: Session, package_id: int) -> "ReviewResultOut":
    pkg = db.get(ApplicationPackage, package_id)
    if pkg is None:
        raise LookupError(f"application_package {package_id} not found")
    rnd = db.execute(select(ReviewRound).where(ReviewRound.package_id == package_id,
                                               ReviewRound.round_no == 1)).scalars().first()
    if rnd is None:
        return ReviewResultOut(round=None, checks=[])
    rows = db.execute(
        select(RoundCheck, ReviewRuleVersion, ReviewRule, ReviewDimension)
        .join(ReviewRuleVersion, ReviewRuleVersion.id == RoundCheck.rule_version_id)
        .join(ReviewRule, ReviewRule.id == ReviewRuleVersion.rule_id)
        .join(ReviewDimension, ReviewDimension.id == ReviewRuleVersion.dimension_id)
        .where(RoundCheck.round_id == rnd.id).order_by(RoundCheck.id)
    ).all()
    checks: list[CheckOut] = []
    for rc, rv, rule, dim in rows:
        ev = db.execute(select(FindingEvidence).where(FindingEvidence.round_check_id == rc.id)
                        .order_by(FindingEvidence.id)).scalars().all()
        eff = rc.final_result if rc.final_result is not None else rc.initial_result
        checks.append(CheckOut(
            round_check_id=rc.id, rule_version_id=rv.id, rule_code=rule.rule_code, name=rv.name,
            dimension_code=dim.code, initial_result=rc.initial_result,
            initial_disposition=rc.initial_disposition, final_result=rc.final_result,
            final_disposition=rc.final_disposition, effective_result=eff, status=rc.status,
            suggestion=rc.suggestion,
            confidence=(float(rc.confidence) if rc.confidence is not None else None),
            severity=rc.severity, version=rc.version,
            evidence=[EvidenceOut(segment_id=e.segment_id, field_code=e.field_code,
                                  budget_item_id=e.budget_item_id, note=e.note) for e in ev]))
    return ReviewResultOut(round=RoundOut(round_id=rnd.id, round_no=rnd.round_no,
                                          conclusion=rnd.conclusion), checks=checks)
