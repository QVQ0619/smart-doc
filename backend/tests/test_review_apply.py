import io
from app import recognition
from tests.test_materialize_config import _seed_rule_doc
from sqlmodel import Session
from app.db import engine


def _bound_package(client, monkeypatch):
    monkeypatch.setattr(recognition, "parse_file", lambda path, ext: (
        [recognition.SegmentDraft(1, {"page": 1}, "paragraph", "申请人:张三")], None))
    files = {"files": ("申请书.docx", io.BytesIO(b"PK\x03\x04x"), "application/octet-stream")}
    pkg_id = client.post("/api/material-files", files=files).json()["package_id"]
    with Session(engine) as db:
        doc_id, rv_id = _seed_rule_doc(db)
    client.post(f"/api/packages/{pkg_id}/bind-config", json={"config_doc_id": doc_id})
    seg_id = client.get(f"/api/packages/{pkg_id}/review-input").json()["segments"][0]["segments"][0]["id"]
    return pkg_id, rv_id, seg_id


def test_apply_writes_checks_and_aggregates(client, monkeypatch):
    pkg_id, rv_id, seg_id = _bound_package(client, monkeypatch)
    payload = {"checks": [{"rule_version_id": rv_id, "initial_result": "fail",
                           "initial_disposition": "reject", "suggestion": "缺申请人",
                           "evidence": [{"segment_id": seg_id, "note": "见第1段"}]}]}
    r = client.post(f"/api/packages/{pkg_id}/review", json=payload)
    assert r.status_code == 200, r.text
    assert r.json()["checks_written"] == 1 and r.json()["evidence_written"] == 1
    assert r.json()["conclusion"] == "reject"  # fail+reject
    got = client.get(f"/api/packages/{pkg_id}/review").json()
    assert got["round"]["conclusion"] == "reject"
    assert got["checks"][0]["initial_result"] == "fail"
    assert got["checks"][0]["effective_result"] == "fail"
    assert got["checks"][0]["evidence"][0]["segment_id"] == seg_id


def test_apply_idempotent_replace(client, monkeypatch):
    pkg_id, rv_id, seg_id = _bound_package(client, monkeypatch)
    p = {"checks": [{"rule_version_id": rv_id, "initial_result": "pass", "evidence": []}]}
    client.post(f"/api/packages/{pkg_id}/review", json=p)
    client.post(f"/api/packages/{pkg_id}/review", json=p)  # 重跑
    got = client.get(f"/api/packages/{pkg_id}/review").json()
    assert len(got["checks"]) == 1  # 替换非累积
    assert got["round"]["conclusion"] == "accept"  # 全 pass


def test_apply_rule_not_in_config_422(client, monkeypatch):
    pkg_id, rv_id, seg_id = _bound_package(client, monkeypatch)
    r = client.post(f"/api/packages/{pkg_id}/review",
                    json={"checks": [{"rule_version_id": 999999, "initial_result": "pass", "evidence": []}]})
    assert r.status_code == 422


def test_apply_evidence_segment_not_in_package_422(client, monkeypatch):
    pkg_id, rv_id, seg_id = _bound_package(client, monkeypatch)
    r = client.post(f"/api/packages/{pkg_id}/review",
                    json={"checks": [{"rule_version_id": rv_id, "initial_result": "fail",
                                      "evidence": [{"segment_id": 999999}]}]})
    assert r.status_code == 422


def test_review_get_no_round(client, monkeypatch):
    monkeypatch.setattr(recognition, "parse_file", lambda path, ext: (
        [recognition.SegmentDraft(1, {"page": 1}, "paragraph", "x")], None))
    files = {"files": ("a.docx", io.BytesIO(b"PK\x03\x04x"), "application/octet-stream")}
    pkg_id = client.post("/api/material-files", files=files).json()["package_id"]
    got = client.get(f"/api/packages/{pkg_id}/review").json()
    assert got["round"] is None and got["checks"] == []
