"""上传同名检测：内容相同→复用；同名不同内容→冲突(不入库)；force→强制新建。

避免同名规则文件(尤其更新版)被无脑新建成重复。
"""


def _pdf(name, content):
    return {"files": (name, content, "application/pdf")}


def test_upload_new_file_created(client):
    r = client.post("/api/standard-docs", files=_pdf("brand-new.pdf", b"xyz-unique"))
    assert r.status_code == 200
    assert r.json()["uploaded"][0]["status"] == "created"
    assert r.json()["conflicts"] == []


def test_upload_identical_content_reused(client):
    r1 = client.post("/api/standard-docs", files=_pdf("dup.pdf", b"same-bytes"))
    doc1 = r1.json()["uploaded"][0]["id"]
    assert r1.json()["uploaded"][0]["status"] == "created"
    r2 = client.post("/api/standard-docs", files=_pdf("dup.pdf", b"same-bytes"))
    u2 = r2.json()["uploaded"][0]
    assert u2["status"] == "reused"
    assert u2["id"] == doc1               # 复用同一文档，不新建
    assert len(client.get("/api/standard-docs").json()) == 1


def test_upload_same_title_diff_content_conflict(client):
    r1 = client.post("/api/standard-docs", files=_pdf("申请规定.pdf", b"v1-content"))
    code1 = r1.json()["uploaded"][0]["doc_code"]
    r2 = client.post("/api/standard-docs", files=_pdf("申请规定.pdf", b"v2-updated-content"))
    d2 = r2.json()
    assert d2["uploaded"] == []           # 同名不同内容 → 不入库
    assert len(d2["conflicts"]) == 1
    assert d2["conflicts"][0]["existing_doc_code"] == code1
    assert len(client.get("/api/standard-docs").json()) == 1  # 库里仍只有旧的


def test_upload_force_creates_despite_same_title(client):
    """force(另存): 保留旧的, 另建一个。"""
    client.post("/api/standard-docs", files=_pdf("申请规定.pdf", b"v1"))
    r2 = client.post("/api/standard-docs?force=true", files=_pdf("申请规定.pdf", b"v2"))
    assert r2.json()["uploaded"][0]["status"] == "created"
    assert r2.json()["conflicts"] == []
    assert len(client.get("/api/standard-docs").json()) == 2   # 另存为两个


def test_upload_force_replace_supersedes_old(client):
    """force+replace(更新): 软删同名旧的, 只留新的。"""
    r1 = client.post("/api/standard-docs", files=_pdf("申请规定.pdf", b"v1"))
    old_id = r1.json()["uploaded"][0]["id"]
    r2 = client.post("/api/standard-docs?force=true&replace=true", files=_pdf("申请规定.pdf", b"v2"))
    assert r2.json()["uploaded"][0]["status"] == "created"
    docs = client.get("/api/standard-docs").json()
    assert len(docs) == 1                 # 旧的被软删，只剩新的
    assert docs[0]["id"] != old_id
