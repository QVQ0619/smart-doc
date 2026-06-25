import io
from sqlmodel import Session
from sqlalchemy import select
from app.db import engine
from app import recognition
from app.models import (ApplicationPackage, BudgetItem, DeclaredProject, ExtractedField,
                        PackageAttachment, PackageCoopUnit, PackageMember)
from app.material_extraction import replace_package_extraction
from app.schemas import MaterialExtractPayload


def _make_package_with_segment(client, monkeypatch):
    monkeypatch.setattr(recognition, "parse_file", lambda path, ext: (
        [recognition.SegmentDraft(1, {"page": 1, "block_index": 0}, "paragraph", "正文")], None))
    files = {"files": ("申请书.docx", io.BytesIO(b"PK\x03\x04x"), "application/octet-stream")}
    body = client.post("/api/material-files", files=files).json()
    pkg_id = body["package_id"]
    mf_id = body["items"][0]["material_file_id"]
    seg_id = client.get(f"/api/material-files/{mf_id}/segments").json()[0]["id"]
    return pkg_id, seg_id


def test_replace_writes_five_tables(client, monkeypatch):
    pkg_id, seg_id = _make_package_with_segment(client, monkeypatch)
    payload = MaterialExtractPayload(
        project_name="某某关键技术研究",
        members=[{"member_role": "applicant", "name": "张三", "title": "教授",
                  "unit_name": "某所", "source_segment_id": seg_id}],
        coop_units=[{"coop_type": "合作单位", "unit_name": "乙单位"}],
        budget_items=[{"category": "设备费", "item_name": "服务器", "amount": 12.5}],
        attachments=[{"attachment_type": "推荐信", "is_present": True}],
        fields=[{"field_code": "project_name", "field_value": "某某关键技术研究"},
                {"field_code": "unknown_x", "field_value": "忽略"}],
    )
    with Session(engine) as db:
        res = replace_package_extraction(db, pkg_id, payload)
    assert res.members == 1 and res.coop_units == 1 and res.budget_items == 1
    assert res.attachments == 1 and res.fields == 1 and res.skipped_fields == 1
    with Session(engine) as db:
        assert db.execute(select(PackageMember).where(PackageMember.package_id == pkg_id)).scalars().one().name == "张三"
        assert db.execute(select(BudgetItem).where(BudgetItem.package_id == pkg_id)).scalars().one().category == "设备费"
        ef_value = db.execute(select(ExtractedField.field_value)
                              .where(ExtractedField.package_id == pkg_id)).scalars().one()
        assert ef_value == "某某关键技术研究"
        dp_name = db.execute(select(DeclaredProject.project_name)
                             .join(ApplicationPackage, ApplicationPackage.declared_project_id == DeclaredProject.id)
                             .where(ApplicationPackage.id == pkg_id)).scalars().one()
        assert dp_name == "某某关键技术研究"


def test_replace_is_idempotent(client, monkeypatch):
    pkg_id, seg_id = _make_package_with_segment(client, monkeypatch)
    p = MaterialExtractPayload(members=[{"member_role": "applicant", "name": "甲"}])
    with Session(engine) as db:
        replace_package_extraction(db, pkg_id, p)
        replace_package_extraction(db, pkg_id, p)  # 重跑
        rows = db.execute(select(PackageMember).where(PackageMember.package_id == pkg_id)).scalars().all()
    assert len(rows) == 1  # 替换而非累积


def test_segment_not_in_package_raises(client, monkeypatch):
    pkg_id, _ = _make_package_with_segment(client, monkeypatch)
    p = MaterialExtractPayload(members=[{"member_role": "applicant", "name": "甲", "source_segment_id": 999999}])
    with Session(engine) as db:
        try:
            replace_package_extraction(db, pkg_id, p)
            assert False, "应抛 ValueError"
        except ValueError:
            pass


def test_unknown_package_raises_lookup(client):
    with Session(engine) as db:
        try:
            replace_package_extraction(db, 888888, MaterialExtractPayload())
            assert False
        except LookupError:
            pass


def test_bad_enum_raises_value(client, monkeypatch):
    pkg_id, _ = _make_package_with_segment(client, monkeypatch)
    p = MaterialExtractPayload(members=[{"member_role": "boss", "name": "甲"}])
    with Session(engine) as db:
        try:
            replace_package_extraction(db, pkg_id, p)
            assert False
        except ValueError:
            pass
