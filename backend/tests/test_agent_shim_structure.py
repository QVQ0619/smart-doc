import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from agent_shim.smart_doc_list_clauses import main as list_main
from agent_shim.smart_doc_rules import main as rules_main


class _Handler(BaseHTTPRequestHandler):
    docs = []
    clauses = []
    post_status = 200
    post_payload = {"inserted": 0, "skipped": 0}

    def _send(self, status, obj):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode("utf-8"))

    def do_GET(self):
        if self.path == "/api/standard-docs":
            self._send(200, self.__class__.docs)
        elif self.path.endswith("/clauses"):
            self._send(200, self.__class__.clauses)
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
    _Handler.clauses = []
    _Handler.post_status = 200
    _Handler.post_payload = {"inserted": 0, "skipped": 0}
    server = HTTPServer(("127.0.0.1", 0), _Handler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    host, port = server.server_address
    try:
        yield f"http://{host}:{port}", _Handler
    finally:
        server.shutdown()
        server.server_close()


def test_list_clauses_numeric_id(monkeypatch, capsys, stub):
    base, h = stub
    h.clauses = [{"id": 9, "clause_no": "二(一)1", "clause_text": "同年限1项",
                  "source_segment_id": 5, "page_no": 5, "locator": {"page": 5}}]
    monkeypatch.setenv("SMART_DOC_API", base)
    code = list_main(["x", "12"])
    out = capsys.readouterr().out
    assert code == 0
    assert out.splitlines()[0] == "doc_id=12"
    assert "二(一)1" in out


def test_list_clauses_by_doc_code(monkeypatch, capsys, stub):
    base, h = stub
    h.docs = [{"id": 7, "doc_code": "SD-aaa", "title": "申请规定"}]
    monkeypatch.setenv("SMART_DOC_API", base)
    assert list_main(["x", "SD-aaa"]) == 0
    assert capsys.readouterr().out.splitlines()[0] == "doc_id=7"


def test_list_clauses_ambiguous_7(monkeypatch, stub):
    base, h = stub
    h.docs = [{"id": 1, "doc_code": "SD-a", "title": "申请规定"},
              {"id": 2, "doc_code": "SD-b", "title": "申请规定"}]
    monkeypatch.setenv("SMART_DOC_API", base)
    assert list_main(["x", "申请规定"]) == 7


def test_list_clauses_notfound_8(monkeypatch, stub):
    base, h = stub
    h.docs = [{"id": 1, "doc_code": "SD-a", "title": "别的"}]
    monkeypatch.setenv("SMART_DOC_API", base)
    assert list_main(["x", "不存在"]) == 8


def test_list_clauses_missing_env_6(monkeypatch):
    monkeypatch.delenv("SMART_DOC_API", raising=False)
    assert list_main(["x", "12"]) == 6


def test_rules_posts_and_prints(tmp_path, monkeypatch, capsys, stub):
    base, h = stub
    h.post_payload = {"inserted": 2, "skipped": 1}
    monkeypatch.setenv("SMART_DOC_API", base)
    f = tmp_path / "r.json"
    f.write_text(json.dumps({"rules": [{"source_clause_id": 9, "dimension_code": "compliance",
                 "name": "n", "decision_type": "hard", "disposition": "reject",
                 "binding_class": "common"}]}), encoding="utf-8")
    code = rules_main(["x", "12", str(f)])
    out = capsys.readouterr().out
    assert code == 0
    assert "inserted=2" in out and "skipped=1" in out


def test_rules_missing_file_2(monkeypatch, stub):
    base, _ = stub
    monkeypatch.setenv("SMART_DOC_API", base)
    assert rules_main(["x", "12", "/no/such.json"]) == 2


def test_rules_backend_500_4(tmp_path, monkeypatch, stub):
    base, h = stub
    h.post_status = 500
    monkeypatch.setenv("SMART_DOC_API", base)
    f = tmp_path / "r.json"
    f.write_text("{}", encoding="utf-8")
    assert rules_main(["x", "12", str(f)]) == 4


def test_rules_missing_env_6(tmp_path, monkeypatch):
    monkeypatch.delenv("SMART_DOC_API", raising=False)
    f = tmp_path / "r.json"
    f.write_text("{}", encoding="utf-8")
    assert rules_main(["x", "12", str(f)]) == 6
