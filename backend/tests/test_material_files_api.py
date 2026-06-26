import io

from sqlmodel import Session
from app.db import engine
from app.models import ParseSegment, MaterialFile
from app import recognition


def _docx_bytes() -> bytes:
    # 复用既有识别测试夹具构造，或最简：用 monkeypatch 跳过真实解析（此处走端点+后台任务，monkeypatch parse_file）
    return b"PK\x03\x04dummy"


def test_upload_creates_package_and_material(client, monkeypatch):
    monkeypatch.setattr(recognition, "parse_file", lambda path, ext: (
        [recognition.SegmentDraft(1, {"page": 1, "block_index": 0}, "paragraph", "正文")], None))
    files = {"files": ("申请书.docx", io.BytesIO(_docx_bytes()),
                       "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    r = client.post("/api/material-files", files=files)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["package_id"] > 0
    assert len(body["items"]) == 1
    mf_id = body["items"][0]["material_file_id"]
    # 后台识别在 TestClient 上下文结束时已执行；查询段落
    segs = client.get(f"/api/material-files/{mf_id}/segments").json()
    assert len(segs) == 1 and segs[0]["content_text"] == "正文"


def test_upload_with_package_id_appends(client, monkeypatch):
    monkeypatch.setattr(recognition, "parse_file", lambda path, ext: (
        [recognition.SegmentDraft(1, {"page": 1, "block_index": 0}, "paragraph", "x")], None))
    f1 = {"files": ("a.docx", io.BytesIO(_docx_bytes()), "application/octet-stream")}
    pkg = client.post("/api/material-files", files=f1).json()["package_id"]
    f2 = {"files": ("b.docx", io.BytesIO(_docx_bytes()), "application/octet-stream")}
    r2 = client.post("/api/material-files", files=f2, data={"package_id": str(pkg)})
    assert r2.json()["package_id"] == pkg
    pkgs = {p["package_id"]: p for p in client.get("/api/material-packages").json()}
    assert pkgs[pkg]["file_count"] == 2


def test_upload_unknown_package_404(client):
    f = {"files": ("a.docx", io.BytesIO(_docx_bytes()), "application/octet-stream")}
    r = client.post("/api/material-files", files=f, data={"package_id": "999999"})
    assert r.status_code == 404


def test_material_packages_aggregates_counts(client, monkeypatch):
    monkeypatch.setattr(recognition, "parse_file", lambda path, ext: (
        [recognition.SegmentDraft(1, {"page": 1}, "paragraph", "x"),
         recognition.SegmentDraft(1, {"page": 1, "block_index": 1}, "paragraph", "y")], None))
    f = {"files": ("a.docx", io.BytesIO(_docx_bytes()), "application/octet-stream")}
    pkg = client.post("/api/material-files", files=f).json()["package_id"]
    rows = client.get("/api/material-packages").json()
    me = next(p for p in rows if p["package_id"] == pkg)
    assert me["file_count"] == 1
    assert me["files"][0]["segment_count"] == 2
    assert me["files"][0]["recognition_status"] == "done"


def test_recognize_unknown_material_404(client):
    r = client.post("/api/material-files/999999/recognize")
    assert r.status_code == 404


# ---------- download ----------

def test_download_material_file_returns_original_bytes(client):
    """上传一个材料文件后，下载端点应返回原始字节及正确的 Content-Disposition。"""
    content = b"download-test-content"
    files = {"files": ("material-test.txt", io.BytesIO(content), "text/plain")}
    r = client.post("/api/material-files", files=files)
    assert r.status_code == 200
    mf_id = r.json()["items"][0]["material_file_id"]

    dl = client.get(f"/api/material-files/{mf_id}/download")
    assert dl.status_code == 200
    assert dl.content == content
    assert "material-test.txt" in dl.headers.get("content-disposition", "")


def test_download_material_file_unknown_404(client):
    """不存在的 material_file_id 应返回 404。"""
    assert client.get("/api/material-files/999999/download").status_code == 404
