from sqlalchemy import text
from sqlmodel import Session

from app.db import engine
from app.models import FileObject, ParseSegment, RegulationClause, StandardDoc


def _seed_doc(doc_code: str, title: str = "政策A") -> int:
    """建一个有效 standard_doc，返回 doc_id。"""
    with Session(engine) as s:
        fo = FileObject(bucket="local", object_key="k", file_name="f.pdf", size_bytes=1)
        s.add(fo); s.flush()
        sd = StandardDoc(doc_code=doc_code, title=title, version="V1.0", file_id=fo.id, is_active=True)
        s.add(sd); s.commit()
        return sd.id


def _add_clause(doc_id: int, doc_code: str, clause_no: str, page: int = 1) -> int:
    with Session(engine) as s:
        seg = ParseSegment(standard_doc_id=doc_id, page_no=page, locator={"page": page, "block_index": 0},
                           segment_type="text", content_text="x")
        s.add(seg); s.flush()
        c = RegulationClause(standard_doc_id=doc_id, doc_code=doc_code, clause_no=clause_no,
                             clause_text="文本", source_segment_id=seg.id)
        s.add(c); s.commit()
        return c.id


def _rule(clause_id: int, dimension: str, name: str) -> dict:
    return {"source_clause_id": clause_id, "dimension_code": dimension, "name": name,
            "logic": "l", "decision_type": "hard", "disposition": "reject", "binding_class": "common"}


def test_lists_doc_with_rules(client):
    doc_id = _seed_doc("SD-cfg1", "申请规定")
    c1 = _add_clause(doc_id, "SD-cfg1", "一")
    client.post(f"/api/standard-docs/{doc_id}/rules", json={"rules": [_rule(c1, "compliance", "规则A")]})
    r = client.get("/api/config-packages")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    p = rows[0]
    assert p["doc_id"] == doc_id
    assert p["doc_code"] == "SD-cfg1"
    assert p["title"] == "申请规定"
    assert p["version"] == "V1.0"
    assert p["rule_count"] == 1
    assert p["dimensions"] == ["合规性"]


def test_doc_without_rules_excluded(client):
    _seed_doc("SD-cfg2")  # 有文档无规则
    r = client.get("/api/config-packages")
    assert r.status_code == 200
    assert r.json() == []


def test_inactive_rule_excluded(client):
    doc_id = _seed_doc("SD-cfg3")
    c1 = _add_clause(doc_id, "SD-cfg3", "一")
    client.post(f"/api/standard-docs/{doc_id}/rules", json={"rules": [_rule(c1, "compliance", "规则A")]})
    with Session(engine) as s:
        s.execute(text("UPDATE review_rule SET is_active = 0"))
        s.commit()
    r = client.get("/api/config-packages")
    assert r.json() == []  # 唯一规则停用 → 包消失


def test_rule_count_and_dimensions_aggregate(client):
    doc_id = _seed_doc("SD-cfg4")
    c1 = _add_clause(doc_id, "SD-cfg4", "一")
    c2 = _add_clause(doc_id, "SD-cfg4", "二")
    client.post(f"/api/standard-docs/{doc_id}/rules", json={"rules": [
        _rule(c1, "compliance", "规则A"),
        _rule(c2, "completeness", "规则B"),
    ]})
    p = client.get("/api/config-packages").json()[0]
    assert p["rule_count"] == 2
    assert set(p["dimensions"]) == {"合规性", "完整性"}


def test_empty_returns_empty_list(client):
    r = client.get("/api/config-packages")
    assert r.status_code == 200
    assert r.json() == []
