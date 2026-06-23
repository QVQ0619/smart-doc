"""依据条款的原地编辑:改条号/条文;空条号 422;跨文档 404;配 key 后无 key 401。"""
import app.config as config

_counter = 0


def _doc(client) -> int:
    global _counter
    _counter += 1
    fname = f"rule_{_counter}.txt"
    body = f"content-{_counter}".encode()
    r = client.post("/api/standard-docs", files={"files": (fname, body, "text/plain")})
    assert r.status_code == 200
    return r.json()["uploaded"][0]["id"]


def _add_clause(client, doc_id, no="第一条", text="旧条文") -> int:
    client.post(
        f"/api/standard-docs/{doc_id}/clauses",
        json={"clauses": [{"clause_no": no, "clause_text": text, "source_segment_id": None}]},
    )
    return client.get(f"/api/standard-docs/{doc_id}/clauses").json()[0]["id"]


def test_update_clause_changes_fields(client):
    doc_id = _doc(client)
    cid = _add_clause(client, doc_id)
    r = client.patch(
        f"/api/standard-docs/{doc_id}/clauses/{cid}",
        json={"clause_no": "第二条", "clause_text": "新条文"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["clause_no"] == "第二条" and body["clause_text"] == "新条文"
    got = client.get(f"/api/standard-docs/{doc_id}/clauses").json()
    assert got[0]["clause_no"] == "第二条" and got[0]["clause_text"] == "新条文"


def test_update_clause_empty_no_rejected(client):
    doc_id = _doc(client)
    cid = _add_clause(client, doc_id)
    r = client.patch(
        f"/api/standard-docs/{doc_id}/clauses/{cid}",
        json={"clause_no": "   ", "clause_text": "x"},
    )
    assert r.status_code == 422


def test_update_clause_cross_doc_404(client):
    doc_a = _doc(client)
    doc_b = _doc(client)
    cid = _add_clause(client, doc_a)
    r = client.patch(
        f"/api/standard-docs/{doc_b}/clauses/{cid}",
        json={"clause_no": "第一条", "clause_text": "x"},
    )
    assert r.status_code == 404


def test_patch_clause_requires_key(client, monkeypatch):
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = client.patch("/api/standard-docs/999999/clauses/1", json={"clause_no": "x", "clause_text": None})
    assert r.status_code == 401  # 鉴权在路由前,无需预置数据


def test_delete_clause_requires_key(client, monkeypatch):
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = client.delete("/api/standard-docs/999999/clauses/1")
    assert r.status_code == 401
