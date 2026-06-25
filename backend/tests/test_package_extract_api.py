import io
from app import recognition


def _upload(client, monkeypatch):
    monkeypatch.setattr(recognition, "parse_file", lambda path, ext: (
        [recognition.SegmentDraft(1, {"page": 1, "block_index": 0}, "paragraph", "正文")], None))
    files = {"files": ("申请书.docx", io.BytesIO(b"PK\x03\x04x"), "application/octet-stream")}
    body = client.post("/api/material-files", files=files).json()
    return body["package_id"], body["items"][0]["material_file_id"]


def test_package_segments_aggregates(client, monkeypatch):
    pkg_id, mf_id = _upload(client, monkeypatch)
    rows = client.get(f"/api/packages/{pkg_id}/segments").json()
    assert len(rows) == 1 and rows[0]["material_file_id"] == mf_id
    assert rows[0]["segments"][0]["content_text"] == "正文"


def test_extract_and_structured_roundtrip(client, monkeypatch):
    pkg_id, mf_id = _upload(client, monkeypatch)
    seg_id = client.get(f"/api/packages/{pkg_id}/segments").json()[0]["segments"][0]["id"]
    payload = {"project_name": "X 研究",
               "members": [{"member_role": "applicant", "name": "张三", "source_segment_id": seg_id}],
               "budget_items": [{"category": "设备费", "item_name": "服务器", "amount": 10}],
               "attachments": [{"attachment_type": "推荐信", "is_present": True}],
               "fields": [{"field_code": "project_name", "field_value": "X 研究"}]}
    r = client.post(f"/api/packages/{pkg_id}/extract", json=payload)
    assert r.status_code == 200, r.text
    assert r.json()["members"] == 1
    s = client.get(f"/api/packages/{pkg_id}/structured").json()
    assert s["members"][0]["name"] == "张三"
    assert s["budget_items"][0]["amount"] == 10.0
    assert s["fields"][0]["field_code"] == "project_name"


def test_extract_unknown_package_404(client):
    r = client.post("/api/packages/777777/extract", json={"members": []})
    assert r.status_code == 404


def test_extract_bad_segment_422(client, monkeypatch):
    pkg_id, _ = _upload(client, monkeypatch)
    r = client.post(f"/api/packages/{pkg_id}/extract",
                    json={"members": [{"member_role": "applicant", "name": "甲", "source_segment_id": 999999}]})
    assert r.status_code == 422


def test_structured_unknown_package_404(client):
    assert client.get("/api/packages/777777/structured").status_code == 404
