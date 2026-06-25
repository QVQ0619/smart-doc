import io
from sqlmodel import Session
from sqlalchemy import select
from app.db import engine
from app import recognition
from app.review_execution import bind_package_config
from app.models import ApplicationPackage, ReviewBatch
from app.materials import ensure_default_master_data
from tests.test_materialize_config import _seed_rule_doc


def _make_package(client, monkeypatch):
    monkeypatch.setattr(recognition, "parse_file", lambda path, ext: (
        [recognition.SegmentDraft(1, {"page": 1}, "paragraph", "正文")], None))
    files = {"files": ("申请书.docx", io.BytesIO(b"PK\x03\x04x"), "application/octet-stream")}
    return client.post("/api/material-files", files=files).json()["package_id"]


def test_bind_creates_dedicated_batch(client, monkeypatch):
    pkg_id = _make_package(client, monkeypatch)
    with Session(engine) as db:
        doc_id, rv_id = _seed_rule_doc(db)
        default_batch_id = ensure_default_master_data(db).batch_id
        old_batch = db.get(ApplicationPackage, pkg_id).batch_id
        assert old_batch == default_batch_id  # A 默认挂共享 batch
        config_id, rule_count = bind_package_config(db, pkg_id, doc_id)
        assert rule_count == 1
    with Session(engine) as db:
        pkg = db.get(ApplicationPackage, pkg_id)
        assert pkg.batch_id != default_batch_id            # 已改挂专属 batch
        batch = db.get(ReviewBatch, pkg.batch_id)
        assert batch.batch_no == f"BATCH-PKG{pkg_id}"
        assert batch.config_id == config_id
        # 默认共享 batch 未被污染
        assert db.get(ReviewBatch, default_batch_id).config_id is None


def test_bind_reuses_dedicated_batch(client, monkeypatch):
    pkg_id = _make_package(client, monkeypatch)
    with Session(engine) as db:
        doc_id, _ = _seed_rule_doc(db)
        config_id, _ = bind_package_config(db, pkg_id, doc_id)
        first_batch = db.get(ApplicationPackage, pkg_id).batch_id
        config_id2, _ = bind_package_config(db, pkg_id, doc_id)  # 再绑
        assert db.get(ApplicationPackage, pkg_id).batch_id == first_batch  # 复用专属 batch
        assert db.get(ReviewBatch, first_batch).config_id == config_id2  # config 仍正确写入


def test_bind_unknown_package_raises(client):
    with Session(engine) as db:
        from app.review_execution import bind_package_config
        try:
            bind_package_config(db, 999999, 1)
            assert False
        except LookupError:
            pass
