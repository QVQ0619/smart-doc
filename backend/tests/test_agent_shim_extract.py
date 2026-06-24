import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from smart_doc_segments import main as segments_main
from smart_doc_clauses import main as clauses_main


class _Handler(BaseHTTPRequestHandler):
    docs = []          # GET /api/standard-docs 返回
    segments = []      # GET /{id}/segments 返回
    post_status = 200
    post_payload = {"inserted": 0, "missing_provenance": 0}

    def _send(self, status, obj):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode("utf-8"))

    def do_GET(self):
        if self.path == "/api/standard-docs":
            self._send(200, self.__class__.docs)
        elif self.path.endswith("/segments"):
            self._send(200, self.__class__.segments)
        else:
            self._send(404, {"detail": "nf"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        self.rfile.read(length)
        self._send(self.__class__.post_status, self.__class__.post_payload)

    def log_message(self, *a):
        pass


@pytest.fixture
def stub():
    _Handler.docs = []
    _Handler.segments = []
    _Handler.post_status = 200
    _Handler.post_payload = {"inserted": 0, "missing_provenance": 0}
    server = HTTPServer(("127.0.0.1", 0), _Handler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    host, port = server.server_address
    try:
        yield f"http://{host}:{port}", _Handler
    finally:
        server.shutdown()
        server.server_close()


def test_segments_by_numeric_id_prints_docid_and_json(monkeypatch, capsys, stub):
    base, h = stub
    h.segments = [{"id": 5, "page_no": 1, "locator": {"page": 1}, "segment_type": "text", "content_text": "第一条"}]
    monkeypatch.setenv("SMART_DOC_API", base)
    code = segments_main(["x", "12"])
    out = capsys.readouterr().out
    assert code == 0
    assert out.splitlines()[0] == "doc_id=12"
    assert "第一条" in out


def test_segments_resolve_by_doc_code(monkeypatch, capsys, stub):
    base, h = stub
    h.docs = [{"id": 7, "doc_code": "SD-aaa", "title": "申请规定"}]
    h.segments = []
    monkeypatch.setenv("SMART_DOC_API", base)
    code = segments_main(["x", "SD-aaa"])
    assert code == 0
    assert capsys.readouterr().out.splitlines()[0] == "doc_id=7"


def test_segments_title_ambiguous_returns_7(monkeypatch, stub):
    base, h = stub
    h.docs = [{"id": 1, "doc_code": "SD-a", "title": "申请规定"},
              {"id": 2, "doc_code": "SD-b", "title": "申请规定"}]
    monkeypatch.setenv("SMART_DOC_API", base)
    assert segments_main(["x", "申请规定"]) == 7


def test_segments_title_notfound_returns_8(monkeypatch, stub):
    base, h = stub
    h.docs = [{"id": 1, "doc_code": "SD-a", "title": "别的"}]
    monkeypatch.setenv("SMART_DOC_API", base)
    assert segments_main(["x", "不存在的"]) == 8


def test_segments_missing_env_returns_6(monkeypatch):
    monkeypatch.delenv("SMART_DOC_API", raising=False)
    assert segments_main(["x", "12"]) == 6


def test_clauses_posts_and_prints_counts(tmp_path, monkeypatch, capsys, stub):
    base, h = stub
    h.post_payload = {"inserted": 3, "missing_provenance": 1}
    monkeypatch.setenv("SMART_DOC_API", base)
    f = tmp_path / "c.json"
    f.write_text(json.dumps({"clauses": [{"clause_no": "第一条", "source_segment_id": 5}]}), encoding="utf-8")
    code = clauses_main(["x", "12", str(f)])
    out = capsys.readouterr().out
    assert code == 0
    assert "inserted=3" in out and "missing_provenance=1" in out


def test_clauses_missing_file_returns_2(monkeypatch, stub):
    base, _ = stub
    monkeypatch.setenv("SMART_DOC_API", base)
    assert clauses_main(["x", "12", "/no/such.json"]) == 2


def test_clauses_backend_500_returns_4(tmp_path, monkeypatch, stub):
    base, h = stub
    h.post_status = 500
    monkeypatch.setenv("SMART_DOC_API", base)
    f = tmp_path / "c.json"
    f.write_text("{}", encoding="utf-8")
    assert clauses_main(["x", "12", str(f)]) == 4


def test_clauses_missing_env_returns_6(tmp_path, monkeypatch):
    monkeypatch.delenv("SMART_DOC_API", raising=False)
    f = tmp_path / "c.json"
    f.write_text("{}", encoding="utf-8")
    assert clauses_main(["x", "12", str(f)]) == 6
