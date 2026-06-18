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
    assert len(r.json()["uploaded"]) == 2


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
