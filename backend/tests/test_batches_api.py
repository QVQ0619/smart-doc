"""GET /api/batches 批次列表 + POST /api/batches 新建批次 接口测试。"""
import app.config as config


# --------------------------------------------------------------------------- #
# 辅助
# --------------------------------------------------------------------------- #

def _post_batch(client, batch_no: str, declare_period: str | None = None, headers=None):
    payload: dict = {"batch_no": batch_no}
    if declare_period is not None:
        payload["declare_period"] = declare_period
    return client.post("/api/batches", json=payload, headers=headers or {})


# --------------------------------------------------------------------------- #
# GET /api/batches
# --------------------------------------------------------------------------- #

def test_get_batches_empty_returns_list(client):
    """conftest 已清空 review_batch，空库时 GET 返回空列表。"""
    r = client.get("/api/batches")
    assert r.status_code == 200
    assert r.json() == []


def test_get_batches_no_auth_needed_when_key_configured(client, monkeypatch):
    """配置 API key 后，GET 读端点仍无需鉴权。"""
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = client.get("/api/batches")
    assert r.status_code == 200


# --------------------------------------------------------------------------- #
# POST /api/batches
# --------------------------------------------------------------------------- #

def test_post_batch_returns_batch_out(client):
    """新建批次响应含 batch_no、status、各计数字段为 0。"""
    r = _post_batch(client, "BATCH-2024")
    assert r.status_code == 200
    data = r.json()
    assert data["batch_no"] == "BATCH-2024"
    assert data["status"] == "reviewing"
    assert data["material_count"] == 0
    assert data["rule_doc_count"] == 0
    assert data["rule_count"] == 0
    assert "project_type_name" in data
    assert "stage_name" in data
    assert data["id"] > 0


def test_post_batch_with_declare_period(client):
    """创建带 declare_period 的批次，回读字段正确。"""
    r = _post_batch(client, "BATCH-2025-Q1", declare_period="2025年第一季度")
    assert r.status_code == 200
    assert r.json()["declare_period"] == "2025年第一季度"


def test_post_batch_then_get_list(client):
    """新建批次后，GET 列表能查到该批次，且计数字段存在。"""
    _post_batch(client, "BATCH-LIST-TEST")
    r = client.get("/api/batches")
    assert r.status_code == 200
    batches = r.json()
    assert any(b["batch_no"] == "BATCH-LIST-TEST" for b in batches)
    # 验证所有字段存在
    target = next(b for b in batches if b["batch_no"] == "BATCH-LIST-TEST")
    for field in ("id", "batch_no", "project_type_name", "stage_name", "status",
                  "material_count", "rule_doc_count", "rule_count"):
        assert field in target, f"缺少字段: {field}"
    assert target["material_count"] == 0
    assert target["rule_doc_count"] == 0
    assert target["rule_count"] == 0


def test_post_batch_duplicate_422(client):
    """相同 batch_no 重复提交 → 422。"""
    _post_batch(client, "BATCH-DUP")
    r = _post_batch(client, "BATCH-DUP")
    assert r.status_code == 422
    assert "已存在" in r.json()["detail"]


def test_post_batch_empty_batch_no_422(client):
    """空 batch_no → 422。"""
    r = client.post("/api/batches", json={"batch_no": "   "})
    assert r.status_code == 422


# --------------------------------------------------------------------------- #
# 鉴权
# --------------------------------------------------------------------------- #

def test_post_batch_requires_key_when_configured(client, monkeypatch):
    """配置 API key 后，POST 缺少 key → 401。"""
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = _post_batch(client, "BATCH-AUTH-FAIL")
    assert r.status_code == 401


def test_post_batch_wrong_key_401(client, monkeypatch):
    """配置 API key 后，POST 带错误 key → 401。"""
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = _post_batch(client, "BATCH-WRONG-KEY", headers={"X-API-Key": "wrong"})
    assert r.status_code == 401


def test_post_batch_correct_key_succeeds(client, monkeypatch):
    """配置 API key 后，POST 带正确 key → 200。"""
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = _post_batch(client, "BATCH-KEYED", headers={"X-API-Key": "secret"})
    assert r.status_code == 200
    assert r.json()["batch_no"] == "BATCH-KEYED"


# --------------------------------------------------------------------------- #
# 幂等性：同名默认批次不能通过 create_batch 再建
# --------------------------------------------------------------------------- #

def test_default_batch_no_duplicate(client):
    """__DEFAULT_BATCH__ 是 ensure_default_master_data 创建的，再 POST 应 422。"""
    # 先通过 POST 建一个普通批次，触发 ensure_default_master_data 创建默认批次
    _post_batch(client, "TRIGGER-DEFAULT")
    # 再尝试 POST __DEFAULT_BATCH__ → 应 422
    r = _post_batch(client, "__DEFAULT_BATCH__")
    assert r.status_code == 422
