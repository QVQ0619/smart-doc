from app.config import get_max_upload_bytes
from app.main import app as fastapi_app


def test_upload_single_rule_file(client, storage_dir):
    r = client.post(
        "/api/standard-docs",
        files=[("files", ("政策A.pdf", b"rule-bytes", "application/pdf"))],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["failed"] == []
    assert len(body["uploaded"]) == 1
    doc = body["uploaded"][0]
    assert doc["title"] == "政策A"
    assert doc["file_name"] == "政策A.pdf"
    assert doc["size_bytes"] == len(b"rule-bytes")
    assert doc["doc_code"].startswith("SD-")
    # 落到 standard_doc 子目录
    assert (storage_dir / "standard_doc").exists()
    assert list((storage_dir / "standard_doc").iterdir())


def test_upload_multiple_rule_files(client):
    r = client.post(
        "/api/standard-docs",
        files=[
            ("files", ("a.txt", b"aaa", "text/plain")),
            ("files", ("b.txt", b"bbbb", "text/plain")),
        ],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["failed"] == []
    assert len(body["uploaded"]) == 2


def test_upload_oversize_goes_to_failed(client):
    fastapi_app.dependency_overrides[get_max_upload_bytes] = lambda: 3
    try:
        r = client.post(
            "/api/standard-docs",
            files=[
                ("files", ("ok.txt", b"ab", "text/plain")),
                ("files", ("big.txt", b"toolong", "text/plain")),
            ],
        )
    finally:
        fastapi_app.dependency_overrides.pop(get_max_upload_bytes, None)
    assert r.status_code == 200
    body = r.json()
    assert [d["file_name"] for d in body["uploaded"]] == ["ok.txt"]
    assert [f["name"] for f in body["failed"]] == ["big.txt"]


def test_standarddoc_failure_rolls_back_fileobject(client, storage_dir, monkeypatch):
    from app.routers import standard_docs
    from sqlalchemy import text
    from sqlmodel import Session
    from app.db import engine

    def boom(*a, **k):
        raise RuntimeError("forced standard_doc failure")
    monkeypatch.setattr(standard_docs, "StandardDoc", boom)

    r = client.post(
        "/api/standard-docs",
        files=[("files", ("x.txt", b"data", "text/plain"))],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["uploaded"] == []
    assert len(body["failed"]) == 1
    # FileObject NOT orphaned (single-transaction rollback)
    with Session(engine) as s:
        n = s.execute(text("SELECT COUNT(*) FROM file_object")).scalar_one()
    assert n == 0
    # disk file removed
    sd_dir = storage_dir / "standard_doc"
    assert (not sd_dir.exists()) or list(sd_dir.iterdir()) == []


def _upload_one(client, name, content):
    return client.post(
        "/api/standard-docs",
        files=[("files", (name, content, "text/plain"))],
    ).json()["uploaded"][0]


def test_list_returns_active(client):
    _upload_one(client, "r1.txt", b"r1")
    _upload_one(client, "r2.txt", b"r2")
    rows = client.get("/api/standard-docs").json()
    assert {d["file_name"] for d in rows} == {"r1.txt", "r2.txt"}


def test_download_returns_original_bytes(client):
    doc = _upload_one(client, "p.txt", b"hello-bytes")
    r = client.get(f"/api/standard-docs/{doc['id']}/download")
    assert r.status_code == 200
    assert r.content == b"hello-bytes"


def test_download_unknown_404(client):
    assert client.get("/api/standard-docs/999999/download").status_code == 404


def test_delete_soft_removes_from_list_but_keeps_file(client, storage_dir):
    doc = _upload_one(client, "d.txt", b"data")
    assert any((storage_dir / "standard_doc").iterdir())

    r = client.delete(f"/api/standard-docs/{doc['id']}")
    assert r.status_code == 204
    # 列表已不含
    assert client.get("/api/standard-docs").json() == []
    # 磁盘文件保留（软删）
    assert list((storage_dir / "standard_doc").iterdir())
    # 再次下载 404（已软删）
    assert client.get(f"/api/standard-docs/{doc['id']}/download").status_code == 404


def test_delete_unknown_404(client):
    assert client.delete("/api/standard-docs/999999").status_code == 404
