"""GET /api/batches 批次列表 + POST /api/batches 新建批次 接口测试。"""
import io
import uuid

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


def test_post_sentinel_directly_on_empty_db_422(client):
    """空库直接 POST batch_no=__DEFAULT_BATCH__ → 422，不得 500。

    修复 M-B2：create_batch 原先先查重再 ensure_default，导致 ensure_default
    在查重通过后建出同名 sentinel，后续 insert 触发 IntegrityError → 500。
    修复后 ensure_default 先执行，查重能覆盖 sentinel，正确返回 422。"""
    r = _post_batch(client, "__DEFAULT_BATCH__")
    assert r.status_code == 422, f"预期 422，实际 {r.status_code}：{r.text}"
    assert "已存在" in r.json()["detail"]


# --------------------------------------------------------------------------- #
# 辅助：上传规则文件
# --------------------------------------------------------------------------- #

def _upload_standard_doc(client, filename: str = "规则A.pdf") -> int:
    """上传一个规则文件（内容含随机 UUID 以避免 content_hash 去重），返回 standard_doc id。"""
    content = f"rule-bytes-{uuid.uuid4().hex}".encode()
    r = client.post(
        "/api/standard-docs",
        files=[("files", (filename, content, "application/pdf"))],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["uploaded"], f"上传失败或冲突: {body}"
    return body["uploaded"][0]["id"]


# --------------------------------------------------------------------------- #
# GET /api/batches/{id} 批次详情
# --------------------------------------------------------------------------- #

def test_get_batch_detail_empty_rule_docs(client):
    """新建批次 → GET /batches/{id} 200，含 BatchOut 全字段 + rule_docs=[]。"""
    r = _post_batch(client, "DETAIL-EMPTY")
    batch_id = r.json()["id"]

    r2 = client.get(f"/api/batches/{batch_id}")
    assert r2.status_code == 200
    data = r2.json()
    # 含 BatchOut 全字段
    for field in ("id", "batch_no", "project_type_name", "stage_name", "status",
                  "material_count", "rule_doc_count", "rule_count"):
        assert field in data, f"缺少字段: {field}"
    assert data["batch_no"] == "DETAIL-EMPTY"
    assert data["rule_docs"] == []
    assert data["rule_doc_count"] == 0


def test_get_batch_detail_unknown_404(client):
    """未知批次 → 404。"""
    r = client.get("/api/batches/99999")
    assert r.status_code == 404


def test_get_batch_detail_no_auth_needed(client, monkeypatch):
    """GET 详情端点免鉴权。"""
    monkeypatch.setattr(config.settings, "api_key", "secret")
    r = _post_batch(client, "DETAIL-NOAUTH", headers={"X-API-Key": "secret"})
    batch_id = r.json()["id"]
    r2 = client.get(f"/api/batches/{batch_id}")
    assert r2.status_code == 200


# --------------------------------------------------------------------------- #
# POST /api/batches/{id}/bind-rule-docs 绑定规则文件
# --------------------------------------------------------------------------- #

def test_bind_rule_docs_two_docs(client):
    """绑定 2 个规则文件 → bound_count=2；详情 rule_docs 含 2 项，rule_doc_count=2。"""
    batch_id = _post_batch(client, "BIND-2DOCS").json()["id"]
    d1 = _upload_standard_doc(client, "规则X.pdf")
    d2 = _upload_standard_doc(client, "规则Y.pdf")

    # 绑定
    rb = client.post(f"/api/batches/{batch_id}/bind-rule-docs",
                     json={"standard_doc_ids": [d1, d2]})
    assert rb.status_code == 200
    assert rb.json()["bound_count"] == 2

    # 详情
    detail = client.get(f"/api/batches/{batch_id}").json()
    assert detail["rule_doc_count"] == 2
    assert len(detail["rule_docs"]) == 2
    ids_in_detail = {doc["id"] for doc in detail["rule_docs"]}
    assert ids_in_detail == {d1, d2}

    # 子集端点
    r_docs = client.get(f"/api/batches/{batch_id}/standard-docs")
    assert r_docs.status_code == 200
    assert len(r_docs.json()) == 2


def test_bind_rule_docs_idempotent_rebind(client):
    """重绑单个 → bound_count=1，详情 rule_docs 1 项。"""
    batch_id = _post_batch(client, "BIND-REBIND").json()["id"]
    d1 = _upload_standard_doc(client, "规则P.pdf")
    d2 = _upload_standard_doc(client, "规则Q.pdf")

    # 先绑 2 个
    client.post(f"/api/batches/{batch_id}/bind-rule-docs",
                json={"standard_doc_ids": [d1, d2]})

    # 重绑只剩 d1
    rb = client.post(f"/api/batches/{batch_id}/bind-rule-docs",
                     json={"standard_doc_ids": [d1]})
    assert rb.status_code == 200
    assert rb.json()["bound_count"] == 1

    detail = client.get(f"/api/batches/{batch_id}").json()
    assert detail["rule_doc_count"] == 1
    assert len(detail["rule_docs"]) == 1
    assert detail["rule_docs"][0]["id"] == d1


def test_bind_rule_docs_unknown_batch_404(client):
    """bind 到未知批次 → 404。"""
    d1 = _upload_standard_doc(client, "规则Z.pdf")
    r = client.post("/api/batches/99999/bind-rule-docs",
                    json={"standard_doc_ids": [d1]})
    assert r.status_code == 404


def test_bind_rule_docs_unknown_doc_404(client):
    """bind 含未知 doc → 404。"""
    batch_id = _post_batch(client, "BIND-UNKNOWNDOC").json()["id"]
    r = client.post(f"/api/batches/{batch_id}/bind-rule-docs",
                    json={"standard_doc_ids": [99999]})
    assert r.status_code == 404


def test_bind_rule_docs_requires_key(client, monkeypatch):
    """配置 API key 后，bind 缺 key → 401；GET 详情免 key。"""
    monkeypatch.setattr(config.settings, "api_key", "secret")
    batch_id = _post_batch(client, "BIND-AUTH", headers={"X-API-Key": "secret"}).json()["id"]

    # 缺 key → 401
    r_no_key = client.post(f"/api/batches/{batch_id}/bind-rule-docs",
                            json={"standard_doc_ids": []})
    assert r_no_key.status_code == 401

    # GET 详情免 key
    r_get = client.get(f"/api/batches/{batch_id}")
    assert r_get.status_code == 200

    # GET standard-docs 子集免 key
    r_docs = client.get(f"/api/batches/{batch_id}/standard-docs")
    assert r_docs.status_code == 200


# --------------------------------------------------------------------------- #
# GET /api/batches/{id}/standard-docs 子集
# --------------------------------------------------------------------------- #

def test_batch_standard_docs_empty(client):
    """未绑定时，子集端点返回空列表。"""
    batch_id = _post_batch(client, "SUBDOCS-EMPTY").json()["id"]
    r = client.get(f"/api/batches/{batch_id}/standard-docs")
    assert r.status_code == 200
    assert r.json() == []


# --------------------------------------------------------------------------- #
# GET /api/batches/{id}/packages 材料包子集
# --------------------------------------------------------------------------- #

def test_batch_standard_docs_clause_and_rule_counts(client):
    """GET /batches/{id}/standard-docs 返回 clause_count 和 rule_count 计数。
    建批次 + 1 个 doc → 写 3 条 RegulationClause + 通过 API 建 2 条规则 → 绑定 → 验证计数。"""
    from sqlalchemy import select as sa_select
    from sqlmodel import Session
    from app.db import engine
    from app.models import RegulationClause, StandardDoc

    # 建批次 + 上传 1 个规则文件
    batch_id = _post_batch(client, "COUNTS-DOCS").json()["id"]
    doc_id = _upload_standard_doc(client, "规则D.pdf")

    # 读取 doc_code（规则 API 需要通过 clause 绑定到 doc）
    with Session(engine) as s:
        doc_code = s.execute(
            sa_select(StandardDoc.doc_code).where(StandardDoc.id == doc_id)
        ).scalar_one()

    # 直接向 DB 写 3 条 RegulationClause
    with Session(engine) as s:
        for i in range(3):
            s.add(RegulationClause(
                standard_doc_id=doc_id,
                doc_code=doc_code,
                clause_no=f"第{i + 1}条",
            ))
        s.commit()

    # 获取第 1 条 clause_id，用于通过 API 建规则
    with Session(engine) as s:
        clause_id = s.execute(
            sa_select(RegulationClause.id)
            .where(RegulationClause.standard_doc_id == doc_id)
            .limit(1)
        ).scalar_one()

    # 通过 API 加 2 条规则（维度已由 ensure_dimensions 在启动时注入）
    r_rules = client.post(f"/api/standard-docs/{doc_id}/rules", json={"rules": [
        {"source_clause_id": clause_id, "dimension_code": "compliance",
         "name": "规则1", "logic": "l", "decision_type": "hard",
         "disposition": "reject", "binding_class": "common"},
        {"source_clause_id": clause_id, "dimension_code": "completeness",
         "name": "规则2", "logic": "l", "decision_type": "soft",
         "disposition": "fix", "binding_class": "common"},
    ]})
    assert r_rules.status_code == 200, r_rules.text

    # 绑定 doc 到批次
    rb = client.post(f"/api/batches/{batch_id}/bind-rule-docs",
                     json={"standard_doc_ids": [doc_id]})
    assert rb.status_code == 200

    # 验证子集端点返回 clause_count 和 rule_count
    r = client.get(f"/api/batches/{batch_id}/standard-docs")
    assert r.status_code == 200
    docs = r.json()
    assert len(docs) == 1
    doc = docs[0]
    assert doc["clause_count"] == 3, f"期望 clause_count=3，实际: {doc}"
    assert doc["rule_count"] == 2, f"期望 rule_count=2，实际: {doc}"


def test_batch_packages_empty(client):
    """空批次，packages 子集端点返回 []。"""
    batch_id = _post_batch(client, "PKGS-EMPTY").json()["id"]
    r = client.get(f"/api/batches/{batch_id}/packages")
    assert r.status_code == 200
    assert r.json() == []


def test_batch_packages_isolation(client, monkeypatch):
    """批次 A 有含材料的包，批次 B 无；GET /batches/A/packages 有该包，B 无。
    同时 GET /material-packages（全局）仍含该包（行为不变）。"""
    from app import recognition

    monkeypatch.setattr(recognition, "parse_file", lambda path, ext: (
        [recognition.SegmentDraft(1, {"page": 1}, "paragraph", "正文")], None))

    # 建两个批次
    batch_a = _post_batch(client, "PKG-BATCH-A").json()["id"]
    batch_b = _post_batch(client, "PKG-BATCH-B").json()["id"]

    # 上传材料文件（会自动造包，绑到默认批次）
    files = {"files": ("申请书.docx", io.BytesIO(b"PK\x03\x04dummy"),
                       "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    upload = client.post("/api/material-files", files=files).json()
    pkg_id = upload["package_id"]

    # 把该包的 batch_id 改成 batch_a
    from sqlmodel import Session
    from app.db import engine
    from app.models import ApplicationPackage
    with Session(engine) as s:
        pkg = s.get(ApplicationPackage, pkg_id)
        pkg.batch_id = batch_a
        s.add(pkg)
        s.commit()

    # batch_a 有该包，batch_b 无
    pkgs_a = client.get(f"/api/batches/{batch_a}/packages").json()
    pkgs_b = client.get(f"/api/batches/{batch_b}/packages").json()
    assert any(p["package_id"] == pkg_id for p in pkgs_a), "batch_a 应含该包"
    assert all(p["package_id"] != pkg_id for p in pkgs_b), "batch_b 不应含该包"

    # 全局列表仍含该包（委托不影响原行为）
    pkgs_global = client.get("/api/material-packages").json()
    assert any(p["package_id"] == pkg_id for p in pkgs_global), "全局列表应仍含该包"
