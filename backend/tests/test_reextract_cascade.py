"""重抽已结构化文档的条款：应级联清掉旧规则再重抽，而非撞 FK 1451。

复现 e2e 实测撞到的 bug：doc 的 regulation_clause 被 review_rule_clause 引用时，
replace_clauses 的 DELETE regulation_clause 触发外键 fk_rvc_clause 失败 → 500。
选定语义=级联重来：重抽自动清该文档基于旧条款的 review_rule 全套。
"""


def _upload_doc(client) -> int:
    r = client.post("/api/standard-docs", files={"files": ("rule.txt", b"x", "text/plain")})
    assert r.status_code == 200
    return r.json()["uploaded"][0]["id"]


def test_reextract_cascades_over_structured_rules(client):
    doc_id = _upload_doc(client)

    # 抽 1 条条款
    r = client.post(
        f"/api/standard-docs/{doc_id}/clauses",
        json={"clauses": [{"clause_no": "第一条", "clause_text": "旧条款", "source_segment_id": None}]},
    )
    assert r.status_code == 200
    cid = client.get(f"/api/standard-docs/{doc_id}/clauses").json()[0]["id"]

    # 结构化成 1 条审查规则(review_rule_clause 引用该条款)
    r = client.post(
        f"/api/standard-docs/{doc_id}/rules",
        json={"rules": [{
            "source_clause_id": cid, "dimension_code": "compliance", "name": "规则A",
            "logic": None, "decision_type": "hard", "disposition": "reject", "binding_class": "common",
        }]},
    )
    assert r.status_code == 200 and r.json()["inserted"] == 1
    assert len(client.get(f"/api/standard-docs/{doc_id}/rules").json()) == 1

    # 重抽不同条款 —— 修复前此处 500(FK 1451)
    r = client.post(
        f"/api/standard-docs/{doc_id}/clauses",
        json={"clauses": [{"clause_no": "第二条", "clause_text": "新条款", "source_segment_id": None}]},
    )
    assert r.status_code == 200
    assert r.json()["inserted"] == 1

    # 级联：旧规则被清空；新条款已写入
    assert client.get(f"/api/standard-docs/{doc_id}/rules").json() == []
    clauses = client.get(f"/api/standard-docs/{doc_id}/clauses").json()
    assert len(clauses) == 1 and clauses[0]["clause_no"] == "第二条"


def test_reextract_without_rules_still_works(client):
    """无规则引用的普通重抽不受影响(回归保护)。"""
    doc_id = _upload_doc(client)
    client.post(
        f"/api/standard-docs/{doc_id}/clauses",
        json={"clauses": [{"clause_no": "第一条", "clause_text": "a", "source_segment_id": None}]},
    )
    r = client.post(
        f"/api/standard-docs/{doc_id}/clauses",
        json={"clauses": [{"clause_no": "第一条", "clause_text": "b", "source_segment_id": None}]},
    )
    assert r.status_code == 200 and r.json()["inserted"] == 1
