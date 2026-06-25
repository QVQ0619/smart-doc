import uuid
from sqlmodel import Session
from sqlalchemy import func, select
from app.db import engine
from app.review_execution import materialize_config
from app.models import (ConfigPackage, ConfigRuleVersion, RegulationClause, ReviewDimension,
                        ReviewRule, ReviewRuleClause, ReviewRuleVersion, StandardDoc)


def _seed_rule_doc(db, decision="hard"):
    """造一个带 1 条 active 规则的规则文件,返回 (doc_id, rule_version_id)。"""
    dim = db.execute(select(ReviewDimension)).scalars().first()
    assert dim is not None  # ensure_dimensions 已在 app 启动 seed
    doc = StandardDoc(doc_code=f"DOC-{uuid.uuid4().hex[:8]}", title="测试规则文件",
                      file_id=None, version="V1", is_active=True)
    db.add(doc); db.flush()
    clause = RegulationClause(standard_doc_id=doc.id, doc_code=doc.doc_code,
                              clause_no="1.1", clause_text="条款", source_segment_id=None)
    db.add(clause); db.flush()
    rule = ReviewRule(rule_code=f"R-{uuid.uuid4().hex[:8]}", current_version_id=None, is_active=True)
    db.add(rule); db.flush()
    rv = ReviewRuleVersion(rule_id=rule.id, version="V1.0", dimension_id=dim.id, name="必须有申请人",
                           logic=None, decision_type=decision, disposition="reject", binding_class="common")
    db.add(rv); db.flush()
    rule.current_version_id = rv.id
    db.add(ReviewRuleClause(rule_version_id=rv.id, clause_id=clause.id))
    db.commit()
    return doc.id, rv.id


def test_materialize_idempotent(client):
    with Session(engine) as db:
        doc_id, rv_id = _seed_rule_doc(db)
        c1 = materialize_config(db, doc_id)
        c2 = materialize_config(db, doc_id)
        assert c1 == c2
        n_cfg = db.execute(select(func.count()).select_from(ConfigPackage)
                           .where(ConfigPackage.id == c1)).scalar_one()
        n_crv = db.execute(select(func.count()).select_from(ConfigRuleVersion)
                           .where(ConfigRuleVersion.config_id == c1)).scalar_one()
        assert n_cfg == 1 and n_crv == 1


def test_materialize_no_rules_raises(client):
    with Session(engine) as db:
        doc = StandardDoc(doc_code="EMPTY", title="空", file_id=None, version="V1", is_active=True)
        db.add(doc); db.commit()
        try:
            materialize_config(db, doc.id)
            assert False, "应抛 ValueError"
        except ValueError:
            pass
