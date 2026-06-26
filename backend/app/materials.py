"""形式审查：占位主数据 + 审查包创建（schema 零 seed，父行须幂等自建）。"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlmodel import Session

from .models import (ApplicationPackage, DeclaredProject, FormField, FormTemplate,
                     MaterialFile, ParseSegment, ProjectType, ResearchPerson,
                     ResearchUnit, ReviewBatch, ReviewStage, SecrecyLevel, SysUser)
from .schemas import MaterialFileBrief, MaterialPackageOut

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


def create_review_package(db: Session, batch_id: int | None = None) -> int:
    """新建一份审查包（declared_project + application_package）。

    batch_id 指定则落该批次；None = 默认批次（兜底，向后兼容）。
    batch_id 不存在 → LookupError。返回 package_id。
    """
    refs = ensure_default_master_data(db)
    if batch_id is None:
        target_batch = refs.batch_id
    else:
        if db.get(ReviewBatch, batch_id) is None:
            raise LookupError(f"批次不存在: {batch_id}")
        target_batch = batch_id
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
        batch_id=target_batch,
        declared_project_id=dp.id,
        current_round=1,
        status="parsing",
    )
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg.id


# 默认申报书标量字段集（extracted_field 经 field_code 映射 form_field_id）
DEFAULT_FORM_FIELDS: list[tuple[str, str, str]] = [
    ("project_name", "项目名称", "text"),
    ("project_category", "项目类别", "enum"),
    ("applicant_name", "申请人", "text"),
    ("applicant_unit", "依托单位", "text"),
    ("total_budget", "经费总额(万元)", "number"),
    ("research_period", "研究周期", "text"),
    ("secrecy_level", "密级", "enum"),
]


def list_packages(db: Session, batch_id: int | None = None) -> list[MaterialPackageOut]:
    """列出有材料的审查包；batch_id 给定则只列该批次的包（None = 全部，保持原行为）。"""
    stmt = select(ApplicationPackage).order_by(ApplicationPackage.id.desc())
    if batch_id is not None:
        stmt = stmt.where(ApplicationPackage.batch_id == batch_id)
    pkgs = db.execute(stmt).scalars().all()
    out: list[MaterialPackageOut] = []
    for pkg in pkgs:
        mfs = db.execute(
            select(MaterialFile)
            .where(MaterialFile.package_id == pkg.id)
            .order_by(MaterialFile.id)
        ).scalars().all()
        if not mfs:
            continue  # 只列有材料的包
        briefs: list[MaterialFileBrief] = []
        for mf in mfs:
            seg_count = db.execute(
                select(func.count()).select_from(ParseSegment)
                .where(ParseSegment.material_file_id == mf.id)
            ).scalar_one()
            briefs.append(MaterialFileBrief(
                material_file_id=mf.id,
                file_name=mf.file_name,
                material_category=mf.material_category,
                recognition_status=mf.recognition_status,
                segment_count=seg_count,
            ))
        out.append(MaterialPackageOut(
            package_id=pkg.id,
            created_at=pkg.created_at,
            file_count=len(briefs),
            files=briefs,
        ))
    return out


def ensure_default_form_template(db: Session) -> int:
    """幂等创建默认 form_template + DEFAULT_FORM_FIELDS，返回 form_template.id。"""
    refs = ensure_default_master_data(db)
    tpl = _get_or_create(
        db, FormTemplate,
        (FormTemplate.project_type_id == refs.project_type_id)
        & (FormTemplate.stage_id == refs.stage_id)
        & (FormTemplate.version == SENTINEL),
        project_type_id=refs.project_type_id, stage_id=refs.stage_id,
        name="默认申报书模板", version=SENTINEL,
    )
    for seq, (code, fname, ltype) in enumerate(DEFAULT_FORM_FIELDS, start=1):
        _get_or_create(
            db, FormField,
            (FormField.template_id == tpl.id) & (FormField.field_code == code),
            template_id=tpl.id, field_code=code, field_name=fname,
            logic_type=ltype, is_required=False, seq=seq,
        )
    db.commit()
    return tpl.id
