import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from agent_shim.smart_doc_add import build_multipart, main


class _Handler(BaseHTTPRequestHandler):
    status = 200
    payload = {"uploaded": [], "failed": []}

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        self.rfile.read(length)  # drain
        self.send_response(self.__class__.status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(self.__class__.payload).encode("utf-8"))

    def log_message(self, *args):  # 静音
        pass


@pytest.fixture
def stub_server():
    _Handler.status = 200
    _Handler.payload = {"uploaded": [], "failed": []}
    server = HTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    try:
        yield f"http://{host}:{port}", _Handler
    finally:
        server.shutdown()
        server.server_close()


def test_build_multipart_uses_files_field_and_includes_bytes(tmp_path):
    f = tmp_path / "政策A.pdf"
    f.write_bytes(b"rule-bytes")
    body, ctype = build_multipart([str(f)])
    assert ctype.startswith("multipart/form-data; boundary=")
    assert b'name="files"' in body
    assert 'filename="政策A.pdf"'.encode("utf-8") in body
    assert b"rule-bytes" in body


def test_main_success_prints_doc_code_and_returns_0(tmp_path, monkeypatch, capsys, stub_server):
    base, handler = stub_server
    handler.status = 200
    handler.payload = {"uploaded": [{"doc_code": "SD-abc123", "title": "政策A", "file_name": "政策A.pdf"}], "failed": []}
    monkeypatch.setenv("SMART_DOC_API", base)
    f = tmp_path / "政策A.pdf"
    f.write_bytes(b"x")
    code = main(["smart-doc-add", str(f)])
    out = capsys.readouterr().out
    assert code == 0
    assert "doc_code=SD-abc123" in out
    assert "title=政策A" in out


def test_main_missing_file_returns_2(monkeypatch, stub_server):
    base, _ = stub_server
    monkeypatch.setenv("SMART_DOC_API", base)
    assert main(["smart-doc-add", "/no/such/file.pdf"]) == 2


def test_main_no_args_returns_1():
    assert main(["smart-doc-add"]) == 1


def test_main_backend_500_returns_4(tmp_path, monkeypatch, stub_server):
    base, handler = stub_server
    handler.status = 500
    handler.payload = {"detail": "boom"}
    monkeypatch.setenv("SMART_DOC_API", base)
    f = tmp_path / "a.txt"
    f.write_bytes(b"a")
    assert main(["smart-doc-add", str(f)]) == 4


def test_main_failed_item_returns_5(tmp_path, monkeypatch, stub_server):
    base, handler = stub_server
    handler.status = 200
    handler.payload = {"uploaded": [], "failed": [{"name": "big.bin", "reason": "超过上限"}]}
    monkeypatch.setenv("SMART_DOC_API", base)
    f = tmp_path / "big.bin"
    f.write_bytes(b"x")
    assert main(["smart-doc-add", str(f)]) == 5


def test_main_missing_api_env_returns_6(tmp_path, monkeypatch):
    monkeypatch.delenv("SMART_DOC_API", raising=False)
    f = tmp_path / "a.txt"
    f.write_bytes(b"a")
    assert main(["smart-doc-add", str(f)]) == 6
