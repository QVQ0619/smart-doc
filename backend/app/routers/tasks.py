"""任务分发域:管理员建任务/传1+4报告/分发/台账,普通用户看我的任务。

角色:管理员=sys_admin/research_admin;普通用户=reviewer。
报告类型固定 5 种(1 综合 + 4 专项),对应普通用户端 5 个审查按钮。
"""
import mimetypes
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlmodel import Session

from ..config import get_max_upload_bytes
from ..db import get_session
from ..deps import get_current_user, get_user_roles, require_role
from ..models import FileObject, Role, ReviewTask, StandardDoc, SysUser, TaskReport, TaskRule, UserRole
from ..storage import FileStorage, FileTooLargeError, get_storage

router = APIRouter(tags=["tasks"])
ADMIN = require_role("sys_admin", "research_admin")

# 1 综合 + 4 专项;顺序即前端展示与审查按钮顺序
REPORT_TYPES: list[tuple[str, str]] = [
    ("comprehensive", "综合论证报告"),
    ("economy", "经济性"),
    ("tech_system", "技术体质"),
    ("system_contribution", "体系贡献率"),
    ("general_quality", "通用质量特性"),
]
REPORT_TYPE_MAP = dict(REPORT_TYPES)

# 上传文件名必须包含对应关键词(如「关于无人装备的经济性审查报告.docx」),用于校验与自动归类
REPORT_KEYWORDS: dict[str, str] = {
    "comprehensive": "综合论证",
    "economy": "经济性",
    "tech_system": "技术体质",
    "system_contribution": "体系贡献率",
    "general_quality": "通用质量特性",
}


# --------------------------- schemas --------------------------- #
class ReportTypeOut(BaseModel):
    code: str
    name: str


class ReportOut(BaseModel):
    id: int
    report_type: str
    report_name: str
    file_id: int | None = None
    file_name: str | None = None
    review_status: str
    uploaded: bool


class TaskOut(BaseModel):
    id: int
    task_no: str
    task_name: str
    status: str
    assignee_id: int | None = None
    assignee_name: str | None = None
    report_total: int
    report_uploaded: int
    created_at: datetime | None = None
    distributed_at: datetime | None = None


class RuleDocBrief(BaseModel):
    id: int
    title: str


class TaskDetailOut(TaskOut):
    reports: list[ReportOut]
    rule_docs: list[RuleDocBrief] = []


class TaskCreateIn(BaseModel):
    task_name: str
    task_no: str | None = None
    rule_doc_ids: list[int] = []


class DistributeIn(BaseModel):
    assignee_id: int


class ReviewerOut(BaseModel):
    id: int
    username: str
    display_name: str | None = None


# --------------------------- helpers --------------------------- #
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _reports(db: Session, task_id: int) -> list[TaskReport]:
    rows = db.execute(select(TaskReport).where(TaskReport.task_id == task_id)).scalars().all()
    order = {code: i for i, (code, _) in enumerate(REPORT_TYPES)}
    return sorted(rows, key=lambda r: order.get(r.report_type, 99))


def _report_out(r: TaskReport) -> ReportOut:
    return ReportOut(
        id=r.id, report_type=r.report_type, report_name=REPORT_TYPE_MAP.get(r.report_type, r.report_type),
        file_id=r.file_id, file_name=r.file_name, review_status=r.review_status, uploaded=r.file_id is not None,
    )


def _task_out(db: Session, t: ReviewTask, reports: list[TaskReport] | None = None) -> TaskOut:
    reps = reports if reports is not None else _reports(db, t.id)
    aname = None
    if t.assignee_id:
        au = db.get(SysUser, t.assignee_id)
        aname = (au.display_name or au.username) if au else None
    return TaskOut(
        id=t.id, task_no=t.task_no, task_name=t.task_name, status=t.status,
        assignee_id=t.assignee_id, assignee_name=aname,
        report_total=len(REPORT_TYPES), report_uploaded=sum(1 for r in reps if r.file_id is not None),
        created_at=t.created_at, distributed_at=t.distributed_at,
    )


def _rule_docs(db: Session, task_id: int) -> list[RuleDocBrief]:
    rows = db.execute(
        select(StandardDoc.id, StandardDoc.title)
        .join(TaskRule, TaskRule.standard_doc_id == StandardDoc.id)
        .where(TaskRule.task_id == task_id)
        .order_by(StandardDoc.id)
    ).all()
    return [RuleDocBrief(id=r[0], title=r[1]) for r in rows]


def _detail_out(db: Session, t: ReviewTask) -> TaskDetailOut:
    reps = _reports(db, t.id)
    base = _task_out(db, t, reps)
    return TaskDetailOut(
        **base.model_dump(),
        reports=[_report_out(r) for r in reps],
        rule_docs=_rule_docs(db, t.id),
    )


# --------------------------- 元数据 --------------------------- #
@router.get("/task-report-types", response_model=list[ReportTypeOut])
def report_types() -> list[ReportTypeOut]:
    return [ReportTypeOut(code=c, name=n) for c, n in REPORT_TYPES]


@router.get("/reviewers", response_model=list[ReviewerOut])
def list_reviewers(db: Session = Depends(get_session), _: SysUser = Depends(ADMIN)) -> list[ReviewerOut]:
    rows = db.execute(
        select(SysUser).join(UserRole, UserRole.user_id == SysUser.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.code == "reviewer", SysUser.status == "active")
        .order_by(SysUser.id)
    ).scalars().all()
    return [ReviewerOut(id=u.id, username=u.username, display_name=u.display_name) for u in rows]


# --------------------------- 管理员:建任务/台账/详情 --------------------------- #
@router.post("/tasks", response_model=TaskDetailOut, status_code=201)
def create_task(body: TaskCreateIn, db: Session = Depends(get_session), me: SysUser = Depends(ADMIN)) -> TaskDetailOut:
    name = body.task_name.strip()
    if not name:
        raise HTTPException(422, "任务名称不能为空")
    t = ReviewTask(task_name=name, task_no=(body.task_no or "").strip() or "PENDING",
                   status="created", created_by=me.id)
    db.add(t)
    db.commit()
    db.refresh(t)
    if t.task_no == "PENDING":
        t.task_no = f"RT{t.id:05d}"
        db.add(t)
        db.commit()
    # 预建 5 个空报告槽
    for code, _name in REPORT_TYPES:
        db.add(TaskReport(task_id=t.id, report_type=code, review_status="pending"))
    # 绑定所选规则库规则(去重,校验存在)
    for did in dict.fromkeys(body.rule_doc_ids):
        if db.get(StandardDoc, did) is not None:
            db.add(TaskRule(task_id=t.id, standard_doc_id=did))
    db.commit()
    db.refresh(t)
    return _detail_out(db, t)


@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(db: Session = Depends(get_session), _: SysUser = Depends(ADMIN)) -> list[TaskOut]:
    tasks = db.execute(select(ReviewTask).order_by(ReviewTask.id.desc())).scalars().all()
    return [_task_out(db, t) for t in tasks]


@router.get("/tasks/{task_id}", response_model=TaskDetailOut)
def get_task(task_id: int, db: Session = Depends(get_session),
             me: SysUser = Depends(get_current_user)) -> TaskDetailOut:
    t = db.get(ReviewTask, task_id)
    if t is None:
        raise HTTPException(404, "任务不存在")
    # 管理员可看全部;普通用户只能看分发给自己的
    roles = get_user_roles(db, me.id)
    is_admin = any(r in ("sys_admin", "research_admin") for r in roles)
    if not is_admin and t.assignee_id != me.id:
        raise HTTPException(403, "无权查看此任务")
    return _detail_out(db, t)


# --------------------------- 管理员:上传 1+4 报告 --------------------------- #
@router.post("/tasks/{task_id}/reports", response_model=ReportOut)
def upload_report(
    task_id: int,
    report_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_session),
    storage: FileStorage = Depends(get_storage),
    max_bytes: int = Depends(get_max_upload_bytes),
    me: SysUser = Depends(ADMIN),
) -> ReportOut:
    t = db.get(ReviewTask, task_id)
    if t is None:
        raise HTTPException(404, "任务不存在")
    if report_type not in REPORT_TYPE_MAP:
        raise HTTPException(422, f"无效报告类型: {report_type}")

    name = file.filename or "unnamed"
    kw = REPORT_KEYWORDS[report_type]
    if kw not in name:
        raise HTTPException(
            422,
            f"文件名需包含「{kw}」以匹配「{REPORT_TYPE_MAP[report_type]}」；当前文件名：{name}",
        )
    try:
        blob = storage.save("report", name, file.file, max_bytes)
    except FileTooLargeError as e:
        raise HTTPException(413, f"超过 {e.limit_bytes} 字节上限")

    tr = db.execute(
        select(TaskReport).where(TaskReport.task_id == task_id, TaskReport.report_type == report_type)
    ).scalar_one_or_none()
    old_key = None
    try:
        fo = FileObject(bucket="local", object_key=blob.object_key, file_name=name,
                        mime_type=file.content_type, size_bytes=blob.size_bytes,
                        content_hash=blob.sha256, sensitivity="内部", uploaded_by=me.id)
        db.add(fo)
        db.flush()
        if tr is None:
            tr = TaskReport(task_id=task_id, report_type=report_type)
            db.add(tr)
        elif tr.file_id:
            old = db.get(FileObject, tr.file_id)
            old_key = old.object_key if old else None
        tr.file_id = fo.id
        tr.file_name = name
        tr.uploaded_by = me.id
        tr.uploaded_at = _now()
        db.commit()
        db.refresh(tr)
    except Exception as e:  # noqa: BLE001
        db.rollback()
        storage.delete(blob.object_key)
        raise HTTPException(500, f"入库失败: {e}")
    if old_key:  # 覆盖上传:删旧文件
        storage.delete(old_key)
    return _report_out(tr)


@router.get("/tasks/{task_id}/reports/{report_id}/download")
def download_report(
    task_id: int,
    report_id: int,
    db: Session = Depends(get_session),
    storage: FileStorage = Depends(get_storage),
    me: SysUser = Depends(get_current_user),
):
    tr = db.get(TaskReport, report_id)
    if tr is None or tr.task_id != task_id:
        raise HTTPException(404, "报告不存在")
    t = db.get(ReviewTask, task_id)
    roles = get_user_roles(db, me.id)
    is_admin = any(r in ("sys_admin", "research_admin") for r in roles)
    if not is_admin and (t is None or t.assignee_id != me.id):
        raise HTTPException(403, "无权下载此报告")
    fo = db.get(FileObject, tr.file_id) if tr.file_id else None
    if fo is None or fo.deleted_at is not None:
        raise HTTPException(404, "报告文件未上传")
    path = storage.base_dir / fo.object_key
    if not path.exists():
        raise HTTPException(404, "文件在磁盘上缺失")
    media_type = mimetypes.guess_type(fo.file_name)[0] or fo.mime_type or "application/octet-stream"
    return FileResponse(path, filename=fo.file_name, media_type=media_type, content_disposition_type="inline")


# --------------------------- 管理员:受理分发(分发即受理) --------------------------- #
@router.post("/tasks/{task_id}/distribute", response_model=TaskOut)
def distribute_task(task_id: int, body: DistributeIn,
                    db: Session = Depends(get_session), me: SysUser = Depends(ADMIN)) -> TaskOut:
    t = db.get(ReviewTask, task_id)
    if t is None:
        raise HTTPException(404, "任务不存在")
    # 校验受理人是启用的评审专家
    reviewer = db.get(SysUser, body.assignee_id)
    if reviewer is None or reviewer.status != "active":
        raise HTTPException(422, "受理人不存在或已停用")
    if "reviewer" not in get_user_roles(db, reviewer.id):
        raise HTTPException(422, "受理人不是评审专家")
    t.assignee_id = reviewer.id
    t.distributed_by = me.id
    t.distributed_at = _now()
    t.status = "distributed"
    t.updated_at = _now()
    db.add(t)
    db.commit()
    db.refresh(t)
    return _task_out(db, t)


@router.post("/tasks/{task_id}/recall", response_model=TaskOut)
def recall_task(task_id: int, db: Session = Depends(get_session), _: SysUser = Depends(ADMIN)) -> TaskOut:
    """撤回已分发的任务:仅当专家尚未开始审查(status=distributed)可撤回;回到待分发,清空受理人。
    撤回后任务从该专家「我的任务」消失,可重新分发或删除。"""
    t = db.get(ReviewTask, task_id)
    if t is None:
        raise HTTPException(404, "任务不存在")
    if t.status != "distributed":
        raise HTTPException(400, "只有已分发且专家尚未开始审查的任务可撤回")
    t.assignee_id = None
    t.distributed_by = None
    t.distributed_at = None
    t.status = "created"
    t.updated_at = _now()
    db.add(t)
    db.commit()
    db.refresh(t)
    return _task_out(db, t)


# 可删除的状态:未分发(created) 或 已完成(done);分发执行中(distributed/reviewing)不可删
DELETABLE_STATUS = {"created", "done"}


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_session),
                storage: FileStorage = Depends(get_storage), _: SysUser = Depends(ADMIN)) -> None:
    t = db.get(ReviewTask, task_id)
    if t is None:
        raise HTTPException(404, "任务不存在")
    if t.status not in DELETABLE_STATUS:
        raise HTTPException(400, "任务已分发且在审查中,不能删除;只有未分发或已完成的任务可删除")
    # 先收集报告文件,删任务(task_report 经外键级联删除),再清磁盘文件与 file_object
    file_ids = [r.file_id for r in _reports(db, task_id) if r.file_id]
    db.delete(t)
    db.commit()
    for fid in file_ids:
        fo = db.get(FileObject, fid)
        if fo:
            storage.delete(fo.object_key)
            db.delete(fo)
    db.commit()


# --------------------------- 普通用户:我的任务 --------------------------- #
@router.get("/my/tasks", response_model=list[TaskOut])
def my_tasks(db: Session = Depends(get_session), me: SysUser = Depends(get_current_user)) -> list[TaskOut]:
    tasks = db.execute(
        select(ReviewTask).where(ReviewTask.assignee_id == me.id).order_by(ReviewTask.id.desc())
    ).scalars().all()
    return [_task_out(db, t) for t in tasks]


# --------------------------- 首页仪表盘统计 --------------------------- #
class OverviewOut(BaseModel):
    total_tasks: int
    done_tasks: int
    active_users: int
    reviewers: int
    reports_uploaded: int
    reports_total: int
    by_status: dict[str, int]


@router.get("/stats/overview", response_model=OverviewOut)
def stats_overview(db: Session = Depends(get_session), _: SysUser = Depends(get_current_user)) -> OverviewOut:
    tasks = db.execute(select(ReviewTask)).scalars().all()
    by_status = {"created": 0, "distributed": 0, "reviewing": 0, "done": 0}
    for t in tasks:
        by_status[t.status] = by_status.get(t.status, 0) + 1
    active_users = db.execute(
        select(func.count(SysUser.id)).where(SysUser.status == "active", SysUser.username != "__system__")
    ).scalar_one()
    reviewers = db.execute(
        select(func.count(func.distinct(UserRole.user_id)))
        .select_from(UserRole).join(Role, Role.id == UserRole.role_id)
        .where(Role.code == "reviewer")
    ).scalar_one()
    uploaded = db.execute(
        select(func.count(TaskReport.id)).where(TaskReport.file_id.is_not(None))
    ).scalar_one()
    return OverviewOut(
        total_tasks=len(tasks),
        done_tasks=by_status.get("done", 0),
        active_users=active_users,
        reviewers=reviewers,
        reports_uploaded=uploaded,
        reports_total=len(tasks) * len(REPORT_TYPES),
        by_status=by_status,
    )


class MyOverviewOut(BaseModel):
    total: int
    received: int      # 已接收(distributed,尚未开始)
    reviewing: int
    done: int
    reports_uploaded: int
    reports_total: int
    by_status: dict[str, int]


@router.get("/my/overview", response_model=MyOverviewOut)
def my_overview(db: Session = Depends(get_session), me: SysUser = Depends(get_current_user)) -> MyOverviewOut:
    tasks = db.execute(select(ReviewTask).where(ReviewTask.assignee_id == me.id)).scalars().all()
    by_status = {"distributed": 0, "reviewing": 0, "done": 0}
    for t in tasks:
        by_status[t.status] = by_status.get(t.status, 0) + 1
    task_ids = [t.id for t in tasks]
    uploaded = 0
    if task_ids:
        uploaded = db.execute(
            select(func.count(TaskReport.id)).where(
                TaskReport.task_id.in_(task_ids), TaskReport.file_id.is_not(None)
            )
        ).scalar_one()
    return MyOverviewOut(
        total=len(tasks),
        received=by_status.get("distributed", 0),
        reviewing=by_status.get("reviewing", 0),
        done=by_status.get("done", 0),
        reports_uploaded=uploaded,
        reports_total=len(tasks) * len(REPORT_TYPES),
        by_status=by_status,
    )
