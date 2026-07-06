import io
import zipfile

from sqlmodel import Session

from app import recognition
from app.db import engine


def _seed_rule_doc(db, decision="hard"):
    """造一个带 1 条 active 规则的规则文件，返回 (doc_id, rule_version_id)。"""
    import uuid
    from sqlalchemy import select
    from app.models import (RegulationClause, ReviewDimension, ReviewRule,
                            ReviewRuleClause, ReviewRuleVersion, StandardDoc)
    dim = db.execute(select(ReviewDimension)).scalars().first()
    assert dim is not None
    doc = StandardDoc(doc_code=f"DOC-{uuid.uuid4().hex[:8]}", title="测试规则文件",
                      file_id=None, version="V1", is_active=True)
    db.add(doc); db.flush()
    clause = RegulationClause(standard_doc_id=doc.id, doc_code=doc.doc_code,
                              clause_no="1.1", clause_text="条款", source_segment_id=None)
    db.add(clause); db.flush()
    rule = ReviewRule(rule_code=f"R-{uuid.uuid4().hex[:8]}", current_version_id=None, is_active=True)
    db.add(rule); db.flush()
    rv = ReviewRuleVersion(rule_id=rule.id, version="V1.0", dimension_id=dim.id,
                           name="必须有申请人", logic=None, decision_type=decision,
                           disposition="reject", binding_class="common")
    db.add(rv); db.flush()
    rule.current_version_id = rv.id
    db.add(ReviewRuleClause(rule_version_id=rv.id, clause_id=clause.id))
    db.commit()
    return doc.id, rv.id


def _reviewed_package(client, monkeypatch):
    """上传材料→绑配置→机审(1条fail)，返回已产生 round 的 package_id。"""
    monkeypatch.setattr(recognition, "parse_file", lambda path, ext: (
        [recognition.SegmentDraft(1, {"page": 1}, "paragraph", "申请人:张三")], None))
    files = {"files": ("申请书.docx", io.BytesIO(b"PK\x03\x04x"), "application/octet-stream")}
    pkg_id = client.post("/api/material-files", files=files).json()["package_id"]
    with Session(engine) as db:
        doc_id, rv_id = _seed_rule_doc(db)
    client.post(f"/api/packages/{pkg_id}/bind-config", json={"config_doc_id": doc_id})
    seg_id = client.get(f"/api/packages/{pkg_id}/review-input").json()["segments"][0]["segments"][0]["id"]
    payload = {"checks": [{"rule_version_id": rv_id, "initial_result": "fail",
                           "initial_disposition": "reject", "suggestion": "缺申请人",
                           "evidence": [{"segment_id": seg_id, "note": "见第1段"}]}]}
    r = client.post(f"/api/packages/{pkg_id}/review", json=payload)
    assert r.status_code == 200, r.text
    return pkg_id


def test_export_returns_zip_with_docx_and_pdf(client, monkeypatch):
    pkg_id = _reviewed_package(client, monkeypatch)
    r = client.get(f"/api/packages/{pkg_id}/report/export")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/zip"
    assert "attachment" in r.headers.get("content-disposition", "")
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        names = z.namelist()
        assert any(n.endswith(".docx") for n in names)
        assert any(n.endswith(".pdf") for n in names)
        for n in names:
            if n.endswith(".pdf"):
                assert z.read(n)[:4] == b"%PDF"


def test_export_format_docx_returns_single_word_file(client, monkeypatch):
    pkg_id = _reviewed_package(client, monkeypatch)
    r = client.get(f"/api/packages/{pkg_id}/report/export?format=docx")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert ".docx" in r.headers.get("content-disposition", "")
    assert r.content[:2] == b"PK"  # docx 是 zip 容器,PK 魔数


def test_export_format_pdf_returns_single_pdf_file(client, monkeypatch):
    pkg_id = _reviewed_package(client, monkeypatch)
    r = client.get(f"/api/packages/{pkg_id}/report/export?format=pdf")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert ".pdf" in r.headers.get("content-disposition", "")
    assert r.content[:4] == b"%PDF"


def test_export_bad_format_422(client, monkeypatch):
    pkg_id = _reviewed_package(client, monkeypatch)
    r = client.get(f"/api/packages/{pkg_id}/report/export?format=txt")
    assert r.status_code == 422


def test_export_unreviewed_package_409(client, monkeypatch):
    monkeypatch.setattr(recognition, "parse_file", lambda path, ext: (
        [recognition.SegmentDraft(1, {"page": 1}, "paragraph", "x")], None))
    files = {"files": ("a.docx", io.BytesIO(b"PK\x03\x04x"), "application/octet-stream")}
    pkg_id = client.post("/api/material-files", files=files).json()["package_id"]
    r = client.get(f"/api/packages/{pkg_id}/report/export")
    assert r.status_code == 409


def test_export_missing_package_404(client):
    r = client.get("/api/packages/999999/report/export")
    assert r.status_code == 404
