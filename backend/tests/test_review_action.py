import io
from app import recognition
from tests.test_materialize_config import _seed_rule_doc
from sqlmodel import Session
from app.db import engine


def _reviewed_check(client, monkeypatch, initial="fail", disp="fix"):
    monkeypatch.setattr(recognition, "parse_file", lambda path, ext: (
        [recognition.SegmentDraft(1, {"page": 1}, "paragraph", "x")], None))
    files = {"files": ("a.docx", io.BytesIO(b"PK\x03\x04x"), "application/octet-stream")}
    pkg_id = client.post("/api/material-files", files=files).json()["package_id"]
    with Session(engine) as db:
        doc_id, rv_id = _seed_rule_doc(db)
    client.post(f"/api/packages/{pkg_id}/bind-config", json={"config_doc_id": doc_id})
    client.post(f"/api/packages/{pkg_id}/review",
                json={"checks": [{"rule_version_id": rv_id, "initial_result": initial,
                                  "initial_disposition": disp, "evidence": []}]})
    got = client.get(f"/api/packages/{pkg_id}/review").json()
    return pkg_id, got["checks"][0]["round_check_id"], got["checks"][0]["version"]


def test_confirm_sets_final_and_reaggregates(client, monkeypatch):
    pkg_id, rc_id, ver = _reviewed_check(client, monkeypatch, initial="pass", disp=None)
    r = client.post(f"/api/round-checks/{rc_id}/review-action",
                    json={"action": "confirm", "version": ver})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["final_result"] == "pass" and body["status"] == "confirmed"
    assert body["version"] == ver + 1


def test_overrule_changes_final_and_conclusion(client, monkeypatch):
    pkg_id, rc_id, ver = _reviewed_check(client, monkeypatch, initial="fail", disp="reject")
    r = client.post(f"/api/round-checks/{rc_id}/review-action",
                    json={"action": "overrule", "final_result": "pass",
                          "final_disposition": None, "remark": "复核通过", "version": ver})
    assert r.status_code == 200, r.text
    assert r.json()["final_result"] == "pass" and r.json()["status"] == "overruled"
    got = client.get(f"/api/packages/{pkg_id}/review").json()
    assert got["round"]["conclusion"] == "accept"  # 唯一 check 改 pass


def test_stale_version_409(client, monkeypatch):
    pkg_id, rc_id, ver = _reviewed_check(client, monkeypatch)
    client.post(f"/api/round-checks/{rc_id}/review-action", json={"action": "confirm", "version": ver})
    r = client.post(f"/api/round-checks/{rc_id}/review-action", json={"action": "confirm", "version": ver})
    assert r.status_code == 409


def test_overrule_bad_result_422(client, monkeypatch):
    pkg_id, rc_id, ver = _reviewed_check(client, monkeypatch)
    r = client.post(f"/api/round-checks/{rc_id}/review-action",
                    json={"action": "overrule", "final_result": "bogus", "version": ver})
    assert r.status_code == 422


def test_unknown_check_404(client):
    r = client.post("/api/round-checks/999999/review-action", json={"action": "confirm", "version": 0})
    assert r.status_code == 404
