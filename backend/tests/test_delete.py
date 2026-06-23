"""删除单条:删条款连带删关联规则;跨文档 404。规则删除用例见 Task 2 追加。"""

_counter = 0


def _doc(client) -> int:
    global _counter
    _counter += 1
    fname = f"rule_{_counter}.txt"
    body = f"content-{_counter}".encode()
    r = client.post("/api/standard-docs", files={"files": (fname, body, "text/plain")})
    assert r.status_code == 200
    return r.json()["uploaded"][0]["id"]


def _clause_with_rule(client, doc_id) -> tuple[int, int]:
    """建 1 条款 + 1 关联规则,返回 (clause_id, rule_id)。"""
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
    rid = client.get(f"/api/standard-docs/{doc_id}/rules").json()[0]["id"]
    return cid, rid


def test_delete_clause_cascades_rule(client):
    doc_id = _doc(client)
    cid, _rid = _clause_with_rule(client, doc_id)
    r = client.delete(f"/api/standard-docs/{doc_id}/clauses/{cid}")
    assert r.status_code == 204
    assert client.get(f"/api/standard-docs/{doc_id}/clauses").json() == []
    assert client.get(f"/api/standard-docs/{doc_id}/rules").json() == []


def test_delete_clause_cross_doc_404(client):
    doc_a = _doc(client)
    doc_b = _doc(client)
    cid, _ = _clause_with_rule(client, doc_a)
    r = client.delete(f"/api/standard-docs/{doc_b}/clauses/{cid}")
    assert r.status_code == 404
