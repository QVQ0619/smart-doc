"""写/变更端点的共享密钥鉴权（X-API-Key）。

策略：未配置 SMART_API_KEY 时放行（向后兼容、本地 dev 零摩擦）；
配置后，写端点必须带正确的 X-API-Key，否则 401。
用 999999 这个不存在的 doc_id：放行时应到达函数得 404，被拦时应在函数前得 401，
以 401 vs 404 精确区分"鉴权是否生效"，无需预置数据。
"""
import app.config as config


def test_no_api_key_configured_allows_writes(client, monkeypatch):
    monkeypatch.setattr(config.settings, "api_key", "")
    r = client.post("/api/standard-docs/999999/clauses", json={"clauses": []})
    assert r.status_code == 404  # 放行 → 函数执行 → doc 不存在


def test_clauses_requires_key_when_configured(client, monkeypatch):
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = client.post("/api/standard-docs/999999/clauses", json={"clauses": []})
    assert r.status_code == 401


def test_clauses_rejects_wrong_key(client, monkeypatch):
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = client.post(
        "/api/standard-docs/999999/clauses",
        json={"clauses": []},
        headers={"X-API-Key": "wrong"},
    )
    assert r.status_code == 401


def test_clauses_accepts_correct_key(client, monkeypatch):
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = client.post(
        "/api/standard-docs/999999/clauses",
        json={"clauses": []},
        headers={"X-API-Key": "secret"},
    )
    assert r.status_code == 404  # 鉴权通过 → 函数执行 → doc 不存在


def test_rules_protected(client, monkeypatch):
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = client.post("/api/standard-docs/999999/rules", json={"rules": []})
    assert r.status_code == 401


def test_recognize_protected(client, monkeypatch):
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = client.post("/api/standard-docs/999999/recognize")
    assert r.status_code == 401


def test_upload_protected(client, monkeypatch):
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = client.post("/api/standard-docs", files={"files": ("a.txt", b"x", "text/plain")})
    assert r.status_code == 401


def test_delete_protected(client, monkeypatch):
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = client.delete("/api/standard-docs/999999")
    assert r.status_code == 401


def test_read_endpoints_stay_open_when_key_configured(client, monkeypatch):
    """GET 读端点本次不纳入保护：配置 key 后仍可匿名访问（不应 401）。"""
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = client.get("/api/standard-docs")
    assert r.status_code == 200
