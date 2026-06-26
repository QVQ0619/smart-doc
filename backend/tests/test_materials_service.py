import pytest
from sqlmodel import Session
from sqlalchemy import select, func

from app.db import engine
from app.materials import ensure_default_master_data, create_review_package
from app.batches import create_batch
from app.schemas import BatchCreateIn
from app.models import (ProjectType, ReviewStage, SecrecyLevel, ResearchUnit,
                        ResearchPerson, SysUser, ReviewBatch, DeclaredProject, ApplicationPackage)


def test_ensure_default_master_data_idempotent(client):
    with Session(engine) as db:
        refs1 = ensure_default_master_data(db)
        refs2 = ensure_default_master_data(db)
    assert refs1.project_type_id == refs2.project_type_id
    assert refs1.batch_id == refs2.batch_id
    with Session(engine) as db:
        # 每类主数据只建一行（哨兵去重）
        assert db.execute(select(func.count()).select_from(ProjectType)
                          .where(ProjectType.code == "__DEFAULT__")).scalar_one() == 1
        assert db.execute(select(func.count()).select_from(ReviewStage)
                          .where(ReviewStage.code == "proposal")).scalar_one() == 1
        assert db.execute(select(func.count()).select_from(SecrecyLevel)
                          .where(SecrecyLevel.code == "__DEF__")).scalar_one() == 1
        assert db.execute(select(func.count()).select_from(SysUser)
                          .where(SysUser.username == "__system__")).scalar_one() == 1
        assert db.execute(select(func.count()).select_from(ReviewBatch)
                          .where(ReviewBatch.batch_no == "__DEFAULT_BATCH__")).scalar_one() == 1


def test_create_review_package_builds_chain(client):
    with Session(engine) as db:
        pkg_id = create_review_package(db)
        pkg = db.get(ApplicationPackage, pkg_id)
        assert pkg is not None and pkg.status == "parsing" and pkg.current_round == 1
        dp = db.get(DeclaredProject, pkg.declared_project_id)
        assert dp is not None and pkg.batch_id is not None
        # 每次新建一个 declared_project + package，但复用同一 batch
        pkg_batch_id = pkg.batch_id
        pkg_dp_id = pkg.declared_project_id
        pkg2_id = create_review_package(db)
        pkg2 = db.get(ApplicationPackage, pkg2_id)
        pkg2_batch_id = pkg2.batch_id
        pkg2_dp_id = pkg2.declared_project_id
    assert pkg2_id != pkg_id
    assert pkg2_batch_id == pkg_batch_id
    assert pkg2_dp_id != pkg_dp_id


# ---------------------------------------------------------------------------
# T10: create_review_package 支持 batch_id 入参
# ---------------------------------------------------------------------------

def test_create_review_package_with_specific_batch_id(client):
    """传入真实 batch_id → 建的包 batch_id 等于该批次。"""
    import uuid
    with Session(engine) as db:
        batch_out = create_batch(db, BatchCreateIn(batch_no=f"T10-BATCH-{uuid.uuid4().hex[:8]}"))
        target_batch_id = batch_out.id
        pkg_id = create_review_package(db, batch_id=target_batch_id)
        pkg = db.get(ApplicationPackage, pkg_id)
        assert pkg is not None
        assert pkg.batch_id == target_batch_id, (
            f"期望 batch_id={target_batch_id}，实际={pkg.batch_id}"
        )
        assert pkg.status == "parsing"
        assert pkg.current_round == 1


def test_create_review_package_no_batch_id_uses_default(client):
    """不传 batch_id → 包落默认批次（ensure_default_master_data 的 batch_id）。"""
    with Session(engine) as db:
        refs = ensure_default_master_data(db)
        pkg_id = create_review_package(db)
        pkg = db.get(ApplicationPackage, pkg_id)
        assert pkg is not None
        assert pkg.batch_id == refs.batch_id, (
            f"期望落默认批次 {refs.batch_id}，实际 {pkg.batch_id}"
        )


def test_create_review_package_unknown_batch_id_raises(client):
    """batch_id 不存在 → 抛 LookupError。"""
    with Session(engine) as db:
        with pytest.raises(LookupError, match="批次不存在"):
            create_review_package(db, batch_id=999999)
