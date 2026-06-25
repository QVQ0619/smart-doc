"""形式审查：占位主数据 + 审查包创建（schema 零 seed，父行须幂等自建）。"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlmodel import Session

from .models import (ApplicationPackage, DeclaredProject, ProjectType, ResearchPerson,
                     ResearchUnit, ReviewBatch, ReviewStage, SecrecyLevel, SysUser)

SENTINEL = "__DEFAULT__"


@dataclass
class DefaultRefs:
    project_type_id: int
    stage_id: int
    secrecy_level_id: int
    unit_id: int
    person_id: int
    sys_user_id: int
    batch_id: int


def _get_or_create(db: Session, model, where, **create):
    row = db.execute(select(model).where(where)).scalars().first()
    if row is None:
        row = model(**create)
        db.add(row)
        db.flush()  # 取 id，不提交
    return row


def ensure_default_master_data(db: Session) -> DefaultRefs:
    """幂等创建并返回占位主数据 + 默认 batch 的 id。"""
    pt = _get_or_create(db, ProjectType, ProjectType.code == SENTINEL,
                        code=SENTINEL, name="默认项目类型", sector="政府", level=1)
    stage = _get_or_create(db, ReviewStage, ReviewStage.code == "proposal",
                           code="proposal", name="形式审查")
    sl = _get_or_create(db, SecrecyLevel, SecrecyLevel.code == "__DEF__",
                        code="__DEF__", name="公开", rank=0)
    unit = _get_or_create(db, ResearchUnit, ResearchUnit.name == "默认依托单位",
                          name="默认依托单位", is_legal_entity=False)
    person = _get_or_create(db, ResearchPerson, ResearchPerson.name == "默认申请人",
                            name="默认申请人", unit_id=unit.id)
    su = _get_or_create(db, SysUser, SysUser.username == "__system__",
                        username="__system__", display_name="系统")
    batch = _get_or_create(db, ReviewBatch, ReviewBatch.batch_no == "__DEFAULT_BATCH__",
                           batch_no="__DEFAULT_BATCH__", project_type_id=pt.id,
                           stage_id=stage.id, created_by=su.id, status="reviewing")
    db.commit()
    return DefaultRefs(pt.id, stage.id, sl.id, unit.id, person.id, su.id, batch.id)


def create_review_package(db: Session) -> int:
    """新建一份审查包（declared_project + application_package），复用占位主数据/默认 batch。返回 package_id。"""
    refs = ensure_default_master_data(db)
    dp = DeclaredProject(
        project_code=f"DP-{uuid.uuid4().hex[:12]}",
        project_name="待审查申请",
        project_type_id=refs.project_type_id,
        declaring_unit_id=refs.unit_id,
        applicant_person_id=refs.person_id,
        secrecy_level_id=refs.secrecy_level_id,
    )
    db.add(dp)
    db.flush()
    pkg = ApplicationPackage(
        batch_id=refs.batch_id,
        declared_project_id=dp.id,
        current_round=1,
        status="parsing",
    )
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg.id
