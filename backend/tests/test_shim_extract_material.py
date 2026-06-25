import importlib
extract = importlib.import_module("smart_doc_extract")        # pytest.ini 已加 helpers 到 pythonpath
segs = importlib.import_module("smart_doc_pkg_segments")


def test_format_result_line():
    line = extract.format_result({"members": 2, "coop_units": 1, "budget_items": 3,
                                  "attachments": 4, "fields": 5, "skipped_fields": 1})
    assert "members=2" in line and "skipped_fields=1" in line


def test_extract_usage_error():
    assert extract.main(["smart_doc_extract.py"]) == 1          # 缺参数


def test_extract_missing_file(tmp_path, monkeypatch):
    monkeypatch.setenv("SMART_DOC_API", "http://x")
    assert extract.main(["smart_doc_extract.py", "5", str(tmp_path / "nope.json")]) == 2


def test_extract_missing_api(tmp_path, monkeypatch):
    monkeypatch.delenv("SMART_DOC_API", raising=False)
    f = tmp_path / "payload.json"; f.write_text("{}", encoding="utf-8")
    assert extract.main(["smart_doc_extract.py", "5", str(f)]) == 6


def test_segments_missing_api(monkeypatch):
    monkeypatch.delenv("SMART_DOC_API", raising=False)
    assert segs.main(["smart_doc_pkg_segments.py", "5"]) == 6


def test_segments_usage_error():
    assert segs.main(["smart_doc_pkg_segments.py"]) == 1  # 缺 package_id
