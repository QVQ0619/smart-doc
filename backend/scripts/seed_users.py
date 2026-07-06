"""种子:创建角色(admin/reviewer)与初始用户,幂等可重复运行。

运行(在 backend 目录):
    .venv\\Scripts\\python.exe scripts\\seed_users.py

初始账号:
    admin      / admin123    (管理员)
    reviewer1  / review123   (评审专家)
    reviewer2  / review123   (评审专家)
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import select                      # noqa: E402
from sqlmodel import Session                        # noqa: E402

from app.db import engine                           # noqa: E402
from app.models import Role, SysUser, UserRole      # noqa: E402
from app.security import hash_password              # noqa: E402

# 注:role.code 受 CHECK 约束,只能取 sys_admin / research_admin / reviewer。
# 本系统两角色:管理员=sys_admin,普通用户=reviewer。
ROLES = [("sys_admin", "管理员"), ("reviewer", "评审专家")]
USERS = [
    # username, display_name, password, role_code
    ("admin", "系统管理员", "admin123", "sys_admin"),
    ("reviewer1", "评审专家一", "review123", "reviewer"),
    ("reviewer2", "评审专家二", "review123", "reviewer"),
]


def upsert_role(db: Session, code: str, name: str) -> Role:
    r = db.execute(select(Role).where(Role.code == code)).scalar_one_or_none()
    if r is None:
        r = Role(code=code, name=name)
        db.add(r)
        db.commit()
        db.refresh(r)
    return r


def upsert_user(db: Session, username: str, display: str, pwd: str, role_code: str) -> SysUser:
    u = db.execute(select(SysUser).where(SysUser.username == username)).scalar_one_or_none()
    if u is None:
        u = SysUser(username=username, display_name=display,
                    password_hash=hash_password(pwd), status="active")
        db.add(u)
    else:
        u.password_hash = hash_password(pwd)
        u.display_name = display
        u.status = "active"
        db.add(u)
    db.commit()
    db.refresh(u)

    rid = db.execute(select(Role.id).where(Role.code == role_code)).scalar_one()
    link = db.execute(
        select(UserRole).where(UserRole.user_id == u.id, UserRole.role_id == rid)
    ).scalar_one_or_none()
    if link is None:
        db.add(UserRole(user_id=u.id, role_id=rid))
        db.commit()
    return u


def main() -> None:
    with Session(engine) as db:
        for code, name in ROLES:
            upsert_role(db, code, name)
        for username, display, pwd, role_code in USERS:
            upsert_user(db, username, display, pwd, role_code)
    print("seeded roles :", [c for c, _ in ROLES])
    print("seeded users :", [u[0] for u in USERS])


if __name__ == "__main__":
    main()
