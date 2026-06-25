import importlib
shim = importlib.import_module("smart_doc_material")  # pytest.ini 已加 helpers 到 pythonpath


def test_build_multipart_two_files(tmp_path):
    a = tmp_path / "a.docx"; a.write_bytes(b"x")
    b = tmp_path / "b.docx"; b.write_bytes(b"y")
    body, ctype = shim.build_multipart([str(a), str(b)])
    assert ctype.startswith("multipart/form-data; boundary=")
    assert body.count(b'name="files"') == 2


def test_wait_for_status_returns_terminal():
    calls = iter([
        [{"package_id": 1, "files": [{"material_file_id": 7, "recognition_status": "processing"}]}],
        [{"package_id": 1, "files": [{"material_file_id": 7, "recognition_status": "done", "segment_count": 3}]}],
    ])
    status, segs = shim.wait_for_status(lambda: next(calls), 7, timeout=5, interval=0,
                                        sleep_fn=lambda s: None, clock=iter([0, 1, 2]).__next__)
    assert status == "done" and segs == 3
