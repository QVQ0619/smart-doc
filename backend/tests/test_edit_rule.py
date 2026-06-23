"""审查规则原地编辑:改字段(版本号/规则id不变);枚举非法 422;非法维度 422;跨文档 404;配 key 后无 key 401。"""
import app.config as config

_counter = 0


def _doc(client) -> int:
    global _counter
    _counter += 1
    r = client.post("/api/standard-docs",
                    files={"files": (f"rule_{_counter}.txt", f"content-{_counter}".encode(), "text/plain")})
    assert r.status_code == 200
    return r.json()["uploaded"][0]["id"]


def _rule(client, doc_id) -> int:
    client.post(
        f"/api/standard-docs/{doc_id}/clauses",
        json={"clauses": [{"clause_no": "第一条", "clause_text": "条文", "source_segment_id": None}]},
    )
    cid = client.get(f"/api/standard-docs/{doc_id}/clauses").json()[0]["id"]
    client.post(
        f"/api/standard-docs/{doc_id}/rules",
        json={"rules": [{
            "source_clause_id": cid, "dimension_code": "compliance", "name": "规则A",
            "logic": None, "decision_type": "hard", "disposition": "reject", "binding_class": "common",
        }]},
    )
    return client.get(f"/api/standard-docs/{doc_id}/rules").json()[0]["id"]


def _payload(**over):
    base = {"name": "规则B", "logic": "新逻辑", "dimension_code": "rationality",
            "decision_type": "verify", "disposition": "fix", "binding_class": "parameterized"}
    base.update(over)
    return base


def test_update_rule_in_place(client):
    doc_id = _doc(client)
    rid = _rule(client, doc_id)
    r = client.patch(f"/api/standard-docs/{doc_id}/rules/{rid}", json=_payload())
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == rid and body["version"] == "V1.0"       # 原地:id/版本不变
    assert body["name"] == "规则B" and body["logic"] == "新逻辑"
    assert body["dimension_code"] == "rationality"
    assert body["decision_type"] == "verify" and body["disposition"] == "fix"
    assert body["binding_class"] == "parameterized"
    got = client.get(f"/api/standard-docs/{doc_id}/rules").json()
    assert len(got) == 1 and got[0]["name"] == "规则B"


def test_update_rule_bad_enum_422(client):
    doc_id = _doc(client)
    rid = _rule(client, doc_id)
    r = client.patch(f"/api/standard-docs/{doc_id}/rules/{rid}", json=_payload(decision_type="bogus"))
    assert r.status_code == 422


def test_update_rule_bad_dimension_422(client):
    doc_id = _doc(client)
    rid = _rule(client, doc_id)
    r = client.patch(f"/api/standard-docs/{doc_id}/rules/{rid}", json=_payload(dimension_code="nope"))
    assert r.status_code == 422


def test_update_rule_cross_doc_404(client):
    doc_a = _doc(client)
    doc_b = _doc(client)
    rid = _rule(client, doc_a)
    r = client.patch(f"/api/standard-docs/{doc_b}/rules/{rid}", json=_payload())
    assert r.status_code == 404


def test_patch_rule_requires_key(client, monkeypatch):
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = client.patch("/api/standard-docs/999999/rules/1", json=_payload())
    assert r.status_code == 401


def test_delete_rule_requires_key(client, monkeypatch):
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = client.delete("/api/standard-docs/999999/rules/1")
    assert r.status_code == 401
