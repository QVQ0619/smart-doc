"""登录与当前用户信息。POST /api/auth/login, GET /api/auth/me。"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlmodel import Session

from ..db import get_session
from ..deps import get_current_user, get_user_roles
from ..models import SysUser
from ..security import sign_token, verify_password

router = APIRouter(tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


class UserInfo(BaseModel):
    id: int
    username: str
    display_name: str | None = None
    roles: list[str] = []
    primary_role: str | None = None


class LoginOut(BaseModel):
    token: str
    user: UserInfo


# 管理员类角色(粗粒度门控用)
ADMIN_ROLES = {"sys_admin", "research_admin"}


def _user_info(db: Session, user: SysUser) -> UserInfo:
    roles = get_user_roles(db, user.id)
    primary = next((r for r in roles if r in ADMIN_ROLES), roles[0] if roles else None)
    return UserInfo(
        id=user.id, username=user.username, display_name=user.display_name,
        roles=roles, primary_role=primary,
    )


@router.post("/auth/login", response_model=LoginOut)
def login(body: LoginIn, db: Session = Depends(get_session)) -> LoginOut:
    user = db.execute(select(SysUser).where(SysUser.username == body.username)).scalar_one_or_none()
    if user is None or user.status != "active" or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    info = _user_info(db, user)
    return LoginOut(token=sign_token(user.id, info.primary_role or "reviewer"), user=info)


@router.get("/auth/me", response_model=UserInfo)
def me(user: SysUser = Depends(get_current_user), db: Session = Depends(get_session)) -> UserInfo:
    return _user_info(db, user)
