"""系统设置(key-value):目前用于「开始审查」提示词模板等可配置项。

读:登录用户(普通用户发起审查时需取模板);写:仅管理员。
key 走白名单,防止任意键注入。
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from ..db import get_session
from ..deps import get_current_user, require_role
from ..models import SysSetting, SysUser

router = APIRouter(tags=["settings"])
ADMIN = require_role("sys_admin", "research_admin")

# 允许读写的设置项白名单
ALLOWED_KEYS = {"review_prompt_template"}


class SettingOut(BaseModel):
    key: str
    value: str | None = None


class SettingIn(BaseModel):
    value: str


def _check_key(key: str) -> None:
    if key not in ALLOWED_KEYS:
        raise HTTPException(404, "未知设置项")


@router.get("/settings/{key}", response_model=SettingOut)
def get_setting(
    key: str,
    db: Session = Depends(get_session),
    _: SysUser = Depends(get_current_user),
) -> SettingOut:
    _check_key(key)
    row = db.get(SysSetting, key)
    return SettingOut(key=key, value=row.value if row else None)


@router.put("/settings/{key}", response_model=SettingOut)
def put_setting(
    key: str,
    body: SettingIn,
    db: Session = Depends(get_session),
    _: SysUser = Depends(ADMIN),
) -> SettingOut:
    _check_key(key)
    row = db.get(SysSetting, key)
    if row is None:
        row = SysSetting(key=key, value=body.value)
    else:
        row.value = body.value
        row.updated_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    return SettingOut(key=key, value=body.value)
