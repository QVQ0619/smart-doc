import io
from app import recognition
from tests.test_materialize_config import _seed_rule_doc
from sqlmodel import Session
from app.db import engine


def _upload(client, monkeypatch):
    monkeypatch.setattr(recognition, "parse_file", lambda path, ext: (
        [recognition.SegmentDraft(1, {"page": 1}, "paragraph", "申请人:张三")], None))
    files = {"files": ("申请书.docx", io.BytesIO(b"PK\x03\x04x"), "application/octet-stream")}
    return client.post("/api/material-files", files=files).json()["package_id"]


def test_bind_config_endpoint(client, monkeypatch):
    pkg_id = _upload(client, monkeypatch)
    with Session(engine) as db:
        doc_id, _ = _seed_rule_doc(db)
    r = client.post(f"/api/packages/{pkg_id}/bind-config", json={"config_doc_id": doc_id})
    assert r.status_code == 200, r.text
    assert r.json()["rule_count"] == 1 and r.json()["config_id"] > 0


def test_review_input_returns_rules_and_data(client, monkeypatch):
    pkg_id = _upload(client, monkeypatch)
    with Session(engine) as db:
        doc_id, rv_id = _seed_rule_doc(db)
    client.post(f"/api/packages/{pkg_id}/bind-config", json={"config_doc_id": doc_id})
    r = client.get(f"/api/packages/{pkg_id}/review-input")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["config_id"] > 0
    assert len(body["rules"]) == 1
    assert body["rules"][0]["rule_version_id"] == rv_id
    assert body["rules"][0]["dimension_code"]  # 维度带出
    assert len(body["segments"]) == 1  # 段落聚合


def test_review_input_unbound_422(client, monkeypatch):
    pkg_id = _upload(client, monkeypatch)
    assert client.get(f"/api/packages/{pkg_id}/review-input").status_code == 422


def test_bind_config_unknown_package_404(client):
    assert client.post("/api/packages/999999/bind-config", json={"config_doc_id": 1}).status_code == 404
