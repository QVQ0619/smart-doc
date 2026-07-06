"""幂等应用 P1 迁移:给 sys_user 加 password_hash 列(已存在则跳过)。

运行(backend 目录): .venv\\Scripts\\python.exe scripts\\apply_auth_migration.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import text          # noqa: E402
from app.db import engine            # noqa: E402

with engine.begin() as c:
    exists = c.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema='smart' AND table_name='sys_user' AND column_name='password_hash'"
    )).scalar()
    if not exists:
        c.execute(text("ALTER TABLE sys_user ADD COLUMN password_hash VARCHAR(255) NULL AFTER display_name"))
        print("added column sys_user.password_hash")
    else:
        print("column sys_user.password_hash already exists")
