from sqlalchemy import text as sqltext
from sqlmodel import Session

from app.db import engine
from app.dimensions import ensure_dimensions
from app.models import FileObject, ParseSegment, RegulationClause, StandardDoc
from app.schemas import RuleIn
from app.structuring import replace_rules


def _seed(doc_code="SD-st01"):
    with Session(engine) as s:
        s.execute(sqltext("SET FOREIGN_KEY_CHECKS=0"))
        for t in ("review_rule_clause", "review_rule_version", "review_rule",
                  "regulation_clause", "parse_segment", "standard_doc", "file_object"):
            s.execute(sqltext(f"DELETE FROM {t}"))
        s.execute(sqltext("SET FOREIGN_KEY_CHECKS=1"))
        s.commit()
    with Session(engine) as db:
        ensure_dimensions(db)
    with Session(engine) as s:
        fo = FileObject(bucket="local", object_key="k", file_name="f.pdf", size_bytes=1)
        s.add(fo); s.flush()
        sd = StandardDoc(doc_code=doc_code, title="t", version="V1.0", file_id=fo.id, is_active=True)
        s.add(sd); s.flush()
        seg = ParseSegment(standard_doc_id=sd.id, page_no=5, locator={"page": 5, "block_index": 0},
                           segment_type="text", content_text="同年只能申请1项")
        s.add(seg); s.flush()
        c1 = RegulationClause(standard_doc_id=sd.id, doc_code=doc_code, clause_no="二(一)1",
                              clause_text="同年只能申请1项同类型项目", source_segment_id=seg.id)
        s.add(c1); s.commit()
        return sd.id, c1.id


def _rule_count():
    with Session(engine) as s:
        return s.execute(sqltext("SELECT COUNT(*) FROM review_rule")).scalar_one()


def _good(clause_id):
    return RuleIn(source_clause_id=clause_id, dimension_code="compliance", name="同年限申请1项",
                  logic="同类型项目同年限1项", decision_type="hard", disposition="reject",
                  binding_class="common")


def test_replace_rules_creates_full_chain(_test_db):
    doc_id, c1 = _seed()
    with Session(engine) as db:
        res = replace_rules(db, doc_id, [_good(c1)])
    assert res.inserted == 1 and res.skipped == 0
    with Session(engine) as s:
        row = s.execute(sqltext(
            "SELECT rr.rule_code, rr.current_version_id, rv.id, rv.version, rv.name, "
            "rv.decision_type, rvc.clause_id "
            "FROM review_rule rr "
            "JOIN review_rule_version rv ON rv.rule_id=rr.id "
            "JOIN review_rule_clause rvc ON rvc.rule_version_id=rv.id")).first()
    assert row[0].startswith("RULE-")
    assert row[1] == row[2]          # current_version_id 已回填且 == version.id
    assert row[3] == "V1.0"
    assert row[5] == "hard"
    assert row[6] == c1              # 关联回源 clause


def test_replace_rules_skips_invalid(_test_db):
    doc_id, c1 = _seed()
    rules = [
        _good(c1),
        RuleIn(source_clause_id=999999, dimension_code="compliance", name="x",
               decision_type="hard", disposition="reject", binding_class="common"),   # 非法 clause
        RuleIn(source_clause_id=c1, dimension_code="nope", name="x",
               decision_type="hard", disposition="reject", binding_class="common"),   # 非法维度
        RuleIn(source_clause_id=c1, dimension_code="compliance", name="x",
               decision_type="BAD", disposition="reject", binding_class="common"),    # 非法枚举
        RuleIn(source_clause_id=c1, dimension_code="compliance", name="  ",
               decision_type="hard", disposition="reject", binding_class="common"),   # 空名
    ]
    with Session(engine) as db:
        res = replace_rules(db, doc_id, rules)
    assert res.inserted == 1 and res.skipped == 4
    assert _rule_count() == 1


def test_replace_rules_idempotent(_test_db):
    doc_id, c1 = _seed()
    with Session(engine) as db:
        replace_rules(db, doc_id, [_good(c1)])
    with Session(engine) as db:
        res = replace_rules(db, doc_id, [_good(c1)])
    assert res.inserted == 1
    assert _rule_count() == 1        # 替换不累加


def test_replace_rules_isolates_other_doc(_test_db):
    doc_id, c1 = _seed()
    # 第二个文档及其 rule
    with Session(engine) as s:
        fo = FileObject(bucket="local", object_key="k2", file_name="f2.pdf", size_bytes=1)
        s.add(fo); s.flush()
        sd2 = StandardDoc(doc_code="SD-st02", title="t2", version="V1.0", file_id=fo.id, is_active=True)
        s.add(sd2); s.flush()
        c2 = RegulationClause(standard_doc_id=sd2.id, doc_code="SD-st02", clause_no="1",
                              clause_text="另一条", source_segment_id=None)
        s.add(c2); s.commit()
        c2_id = c2.id
        doc2 = sd2.id
    with Session(engine) as db:
        replace_rules(db, doc_id, [_good(c1)])
    with Session(engine) as db:
        replace_rules(db, doc2, [_good(c2_id)])
    with Session(engine) as db:
        replace_rules(db, doc_id, [_good(c1)])   # 重抽 doc1 不应删 doc2 的 rule
    assert _rule_count() == 2
