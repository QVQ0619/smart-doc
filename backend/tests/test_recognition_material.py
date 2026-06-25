from pathlib import Path
import io

from sqlmodel import Session

from app.db import engine
from app.storage import FileStorage
from app.materials import create_review_package
from app.models import FileObject, MaterialFile, ParseSegment
from app import recognition
from app.recognition import recognize_material_file, SegmentDraft


def _make_material(db, storage_dir, ext=".docx") -> int:
    storage = FileStorage(storage_dir)
    blob = storage.save("material", f"x{ext}", io.BytesIO(b"dummy"), 10_000_000)
    fo = FileObject(bucket="local", object_key=blob.object_key, file_name=f"x{ext}",
                    size_bytes=blob.size_bytes, content_hash=blob.sha256, sensitivity="内部")
    db.add(fo); db.flush()
    from app.materials import ensure_default_master_data
    refs = ensure_default_master_data(db)
    pkg_id = create_review_package(db)
    mf = MaterialFile(package_id=pkg_id, round_no=1, material_category="application_form",
                      file_name=f"x{ext}", file_format=ext.lstrip("."), file_id=fo.id,
                      secrecy_level_id=refs.secrecy_level_id)
    db.add(mf); db.commit(); db.refresh(mf)
    return mf.id


def test_recognize_material_file_writes_segments(client, storage_dir, monkeypatch):
    # 隔离 DB 写逻辑：parse_file 直接返回两段草稿
    monkeypatch.setattr(recognition, "parse_file", lambda path, ext: (
        [SegmentDraft(1, {"page": 1, "block_index": 0}, "paragraph", "正文一"),
         SegmentDraft(None, {"para_index": 2, "level": 1}, "heading", "标题")], None))
    with Session(engine) as db:
        mf_id = _make_material(db, storage_dir)
        res = recognize_material_file(db, FileStorage(storage_dir), mf_id)
        assert res.recognition_status == "done"
        assert res.segment_count == 2
        segs = db.execute(
            ParseSegment.__table__.select().where(ParseSegment.material_file_id == mf_id)
        ).fetchall()
        assert len(segs) == 2
        # segment_type 映射到 DB 白名单
        types = {row.segment_type for row in segs}
        assert types <= {"text", "table", "title", "figure"}
        mf = db.get(MaterialFile, mf_id)
        assert mf.recognition_status == "done"


def test_recognize_material_file_failure_sets_error(client, storage_dir, monkeypatch):
    monkeypatch.setattr(recognition, "parse_file", lambda path, ext: ([], "空文档，未抽取到任何内容"))
    with Session(engine) as db:
        mf_id = _make_material(db, storage_dir)
        res = recognize_material_file(db, FileStorage(storage_dir), mf_id)
        assert res.recognition_status == "failed"
        assert res.segment_count == 0
        mf = db.get(MaterialFile, mf_id)
        assert mf.recognition_status == "failed" and mf.recognition_error
