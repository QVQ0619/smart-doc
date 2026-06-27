"""彻底删除规则文件：物理级联清除 batch_rule_doc / 规则全链 / 条款 / 段落，并物理删除 standard_doc。"""
import uuid

from sqlalchemy import func, select
from sqlmodel import Session

from app.db import engine
from app.models import (BatchRuleDoc, ParseSegment, RegulationClause,
                        ReviewRuleClause, StandardDoc)


def _upload(client, filename="规则X.pdf") -> int:
    content = f"rule-{uuid.uuid4().hex}".encode()
    r = client.post("/api/standard-docs",
                    files=[("files", (filename, content, "application/pdf"))])
    assert r.status_code == 200, r.text
    return r.json()["uploaded"][0]["id"]


def test_delete_standard_doc_cascades_everything(client):
    doc_id = _upload(client)

    # 写 1 条 RegulationClause + 1 条 ParseSegment（直接落 DB）
    with Session(engine) as s:
        doc_code = s.execute(
            select(StandardDoc.doc_code).where(StandardDoc.id == doc_id)
        ).scalar_one()
        s.add(RegulationClause(standard_doc_id=doc_id, doc_code=doc_code, clause_no="第一条"))
        s.add(ParseSegment(standard_doc_id=doc_id, segment_type="text", content_text="正文"))
        s.commit()
        clause_id = s.execute(
            select(RegulationClause.id).where(RegulationClause.standard_doc_id == doc_id)
        ).scalar_one()

    # 经 API 建 1 条 review_rule（绑定到上面的 clause）
    r = client.post(f"/api/standard-docs/{doc_id}/rules", json={"rules": [
        {"source_clause_id": clause_id, "dimension_code": "compliance", "name": "规则A",
         "logic": None, "decision_type": "hard", "disposition": "reject",
         "binding_class": "common"}]})
    assert r.status_code == 200, r.text

    # 绑定到批次
    batch_id = client.post("/api/batches", json={"batch_no": "DEL-CASCADE"}).json()["id"]
    client.post(f"/api/batches/{batch_id}/bind-rule-docs",
                json={"standard_doc_ids": [doc_id]})

    # 彻底删除
    assert client.delete(f"/api/standard-docs/{doc_id}").status_code == 204

    with Session(engine) as s:
        assert s.get(StandardDoc, doc_id) is None                       # 物理删
        assert s.execute(select(func.count()).select_from(BatchRuleDoc)
                         .where(BatchRuleDoc.standard_doc_id == doc_id)).scalar_one() == 0
        assert s.execute(select(func.count()).select_from(RegulationClause)
                         .where(RegulationClause.standard_doc_id == doc_id)).scalar_one() == 0
        assert s.execute(select(func.count()).select_from(ParseSegment)
                         .where(ParseSegment.standard_doc_id == doc_id)).scalar_one() == 0
        assert s.execute(select(func.count()).select_from(ReviewRuleClause)).scalar_one() == 0


def test_delete_standard_doc_unknown_404(client):
    assert client.delete("/api/standard-docs/999999").status_code == 404
