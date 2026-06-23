from sqlmodel import Session

from app.db import engine
from app.models import FileObject, ParseSegment, RegulationClause, StandardDoc


def _seed_doc_with_clause(client, doc_code="SD-api01"):
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


def _payload(clause_id):
    return {"rules": [{
        "source_clause_id": clause_id, "dimension_code": "compliance", "name": "同年限申请1项",
        "logic": "同类型同年限1项", "decision_type": "hard", "disposition": "reject",
        "binding_class": "common",
    }]}


def test_post_rules_writes(client):
    doc_id, c1 = _seed_doc_with_clause(client)
    r = client.post(f"/api/standard-docs/{doc_id}/rules", json=_payload(c1))
    assert r.status_code == 200
    assert r.json() == {"inserted": 1, "skipped": 0}


def test_get_rules_returns_struct_and_provenance(client):
    doc_id, c1 = _seed_doc_with_clause(client)
    client.post(f"/api/standard-docs/{doc_id}/rules", json=_payload(c1))
    r = client.get(f"/api/standard-docs/{doc_id}/rules")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    row = rows[0]
    assert row["version"] == "V1.0"
    assert row["dimension_code"] == "compliance" and row["dimension_name"] == "合规性"
    assert row["decision_type"] == "hard" and row["disposition"] == "reject"
    assert row["binding_class"] == "common"
    assert row["source_clause_id"] == c1
    assert row["clause_no"] == "二(一)1"
    assert row["clause_text"] == "同年只能申请1项同类型项目"
    assert row["page_no"] == 5
    assert row["locator"]["block_index"] == 0


def test_get_rules_empty_when_not_structured(client):
    doc_id, _ = _seed_doc_with_clause(client)
    r = client.get(f"/api/standard-docs/{doc_id}/rules")
    assert r.status_code == 200 and r.json() == []


def test_post_rules_404_when_doc_missing(client):
    r = client.post("/api/standard-docs/999999/rules", json={"rules": []})
    assert r.status_code == 404


def test_get_rules_404_when_doc_missing(client):
    r = client.get("/api/standard-docs/999999/rules")
    assert r.status_code == 404


def test_post_empty_rules_ok(client):
    doc_id, _ = _seed_doc_with_clause(client)
    r = client.post(f"/api/standard-docs/{doc_id}/rules", json={"rules": []})
    assert r.status_code == 200 and r.json() == {"inserted": 0, "skipped": 0}
