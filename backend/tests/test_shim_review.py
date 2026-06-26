import importlib
rin = importlib.import_module("smart_doc_review_input")    # pytest.ini 已加 helpers 到 pythonpath
rv = importlib.import_module("smart_doc_review")


def test_review_format_result():
    line = rv.format_result({"round_id": 3, "round_no": 1, "conclusion": "reject",
                             "checks_written": 5, "evidence_written": 7})
    assert "conclusion=reject" in line and "checks_written=5" in line


def test_review_usage_error():
    assert rv.main(["smart_doc_review.py"]) == 1


def test_review_missing_file(tmp_path, monkeypatch):
    monkeypatch.setenv("SMART_DOC_API", "http://x")
    assert rv.main(["smart_doc_review.py", "5", str(tmp_path / "nope.json")]) == 2


def test_review_missing_api(tmp_path, monkeypatch):
    monkeypatch.delenv("SMART_DOC_API", raising=False)
    f = tmp_path / "p.json"; f.write_text("{}", encoding="utf-8")
    assert rv.main(["smart_doc_review.py", "5", str(f)]) == 6


def test_input_usage_error():
    assert rin.main(["smart_doc_review_input.py"]) == 1   # 缺 package_id/config_doc_id


def test_input_missing_api(monkeypatch):
    monkeypatch.delenv("SMART_DOC_API", raising=False)
    assert rin.main(["smart_doc_review_input.py", "5", "7"]) == 6
