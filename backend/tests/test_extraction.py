from sqlalchemy import text as sqltext
from sqlmodel import Session

from app.db import engine
from app.extraction import replace_clauses
from app.models import FileObject, ParseSegment, StandardDoc
from app.schemas import ClauseIn


def _seed(doc_code="SD-ext01"):
    with Session(engine) as s:
        s.execute(sqltext("SET FOREIGN_KEY_CHECKS=0"))
        for t in ("regulation_clause", "parse_segment", "standard_doc", "file_object"):
            s.execute(sqltext(f"DELETE FROM {t}"))
        s.execute(sqltext("SET FOREIGN_KEY_CHECKS=1"))
        fo = FileObject(bucket="local", object_key="k", file_name="f.pdf", size_bytes=1)
        s.add(fo)
        s.flush()
        sd = StandardDoc(doc_code=doc_code, title="t", version="V1.0", file_id=fo.id, is_active=True)
        s.add(sd)
        s.flush()
        seg1 = ParseSegment(standard_doc_id=sd.id, page_no=1, locator={"page": 1, "block_index": 0}, segment_type="text", content_text="第一条")
        seg2 = ParseSegment(standard_doc_id=sd.id, page_no=2, locator={"page": 2, "block_index": 0}, segment_type="text", content_text="第二条")
        s.add(seg1)
        s.add(seg2)
        s.commit()
        return sd.id, seg1.id, seg2.id


def _count(doc_id):
    with Session(engine) as s:
        return s.execute(sqltext("SELECT COUNT(*) FROM regulation_clause WHERE standard_doc_id=:d"), {"d": doc_id}).scalar_one()


def test_replace_clauses_writes_and_fills_doc_code(_test_db):
    doc_id, seg1, seg2 = _seed()
    with Session(engine) as db:
        res = replace_clauses(db, doc_id, [
            ClauseIn(clause_no="第一条", clause_text="aaa", source_segment_id=seg1),
            ClauseIn(clause_no="第二条", clause_text="bbb", source_segment_id=seg2),
        ])
    assert res.inserted == 2
    assert res.missing_provenance == 0
    assert _count(doc_id) == 2
    with Session(engine) as s:
        row = s.execute(sqltext(
            "SELECT doc_code, standard_doc_id, source_segment_id FROM regulation_clause WHERE clause_no='第一条'")).first()
    assert row[0] == "SD-ext01" and row[1] == doc_id and row[2] == seg1


def test_replace_clauses_invalid_or_missing_segment_nulled_and_counted(_test_db):
    doc_id, seg1, seg2 = _seed()
    with Session(engine) as db:
        res = replace_clauses(db, doc_id, [
            ClauseIn(clause_no="#1", clause_text="x", source_segment_id=999999),  # 非法
            ClauseIn(clause_no="#2", clause_text="y", source_segment_id=None),     # 缺
        ])
    assert res.inserted == 2
    assert res.missing_provenance == 2
    with Session(engine) as s:
        nulls = s.execute(sqltext(
            "SELECT COUNT(*) FROM regulation_clause WHERE standard_doc_id=:d AND source_segment_id IS NULL"), {"d": doc_id}).scalar_one()
    assert nulls == 2


def test_replace_clauses_idempotent_replace(_test_db):
    doc_id, seg1, seg2 = _seed()
    with Session(engine) as db:
        replace_clauses(db, doc_id, [ClauseIn(clause_no="第一条", source_segment_id=seg1)])
    with Session(engine) as db:
        res = replace_clauses(db, doc_id, [ClauseIn(clause_no="第一条", source_segment_id=seg1)])
    assert res.inserted == 1
    assert _count(doc_id) == 1
