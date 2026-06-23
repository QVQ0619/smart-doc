"""一步抽取：POST /extract-rules 原子地把 段落判定 → 依据条款 + 审查规则 一次入库。

每个 item = 一条审查规则及其依据条款(1:1)：含条款字段(clause_no/clause_text/source_segment_id)
+ 规则字段(dimension_code/name/logic/decision_type/disposition/binding_class)。
后端插 regulation_clause 拿 id → 插 review_rule+version+rule_clause(关联该 id)，单事务。
"""


def _upload(client) -> int:
    r = client.post("/api/standard-docs", files={"files": ("rule.txt", b"x", "text/plain")})
    assert r.status_code == 200
    return r.json()["uploaded"][0]["id"]


def _item(clause_no, name, dim="compliance"):
    return {
        "clause_no": clause_no, "clause_text": f"{clause_no} 的条文", "source_segment_id": None,
        "dimension_code": dim, "name": name, "logic": None,
        "decision_type": "hard", "disposition": "reject", "binding_class": "common",
    }


def test_extract_rules_one_step(client):
    doc_id = _upload(client)
    r = client.post(
        f"/api/standard-docs/{doc_id}/extract-rules",
        json={"items": [_item("第一条", "高级职称要求"), _item("第二条", "限项", "consistency")]},
    )
    assert r.status_code == 200
    d = r.json()
    assert d["clauses_inserted"] == 2
    assert d["rules_inserted"] == 2
    assert d["skipped"] == 0
    # 条款 + 规则都入库，规则关联回条款(出处继承)
    clauses = client.get(f"/api/standard-docs/{doc_id}/clauses").json()
    assert len(clauses) == 2
    rules = client.get(f"/api/standard-docs/{doc_id}/rules").json()
    assert len(rules) == 2
    assert {r["clause_no"] for r in rules} == {"第一条", "第二条"}


def test_extract_rules_skips_invalid_rule_fields(client):
    doc_id = _upload(client)
    bad = _item("第一条", "x")
    bad["dimension_code"] = "NOPE"
    r = client.post(f"/api/standard-docs/{doc_id}/extract-rules", json={"items": [bad]})
    assert r.status_code == 200
    d = r.json()
    assert d["skipped"] == 1 and d["clauses_inserted"] == 0 and d["rules_inserted"] == 0


def test_extract_rules_idempotent_replace(client):
    doc_id = _upload(client)
    client.post(f"/api/standard-docs/{doc_id}/extract-rules", json={"items": [_item("第一条", "A")]})
    r = client.post(f"/api/standard-docs/{doc_id}/extract-rules", json={"items": [_item("第二条", "B")]})
    assert r.status_code == 200 and r.json()["rules_inserted"] == 1
    rules = client.get(f"/api/standard-docs/{doc_id}/rules").json()
    assert len(rules) == 1 and rules[0]["clause_no"] == "第二条"  # 旧条款+规则被 replace
    clauses = client.get(f"/api/standard-docs/{doc_id}/clauses").json()
    assert len(clauses) == 1 and clauses[0]["clause_no"] == "第二条"


def test_extract_rules_protected_by_key(client, monkeypatch):
    import app.config as config
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = client.post("/api/standard-docs/999999/extract-rules", json={"items": []})
    assert r.status_code == 401
