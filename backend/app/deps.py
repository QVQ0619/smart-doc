"""认证/鉴权依赖:从 Authorization: Bearer <token> 解析当前用户,并做角色门控。

与现有 auth.py(共享密钥,护 agent/隧道写库)并存,互不冲突。
"""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlmodel import Session

from .db import get_session
from .models import Role, SysUser, UserRole
from .security import verify_token


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_session),
) -> SysUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="未登录")
    data = verify_token(authorization.split(" ", 1)[1].strip())
    if not data:
        raise HTTPException(status_code=401, detail="登录已失效,请重新登录")
    user = db.get(SysUser, data["user_id"])
    if user is None or user.status != "active":
        raise HTTPException(status_code=401, detail="用户不存在或已停用")
    return user


def get_user_roles(db: Session, user_id: int) -> list[str]:
    rows = db.execute(
        select(Role.code).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == user_id)
    ).all()
    return [r[0] for r in rows]


def require_role(*roles: str):
    """返回一个依赖:要求当前用户至少拥有 roles 之一,否则 403。"""
    def _dep(user: SysUser = Depends(get_current_user), db: Session = Depends(get_session)) -> SysUser:
        codes = get_user_roles(db, user.id)
        if not any(r in codes for r in roles):
            raise HTTPException(status_code=403, detail="无权限执行此操作")
        return user
    return _dep
