"""幂等应用系统设置迁移:创建 sys_setting 表(已存在则跳过)。

运行(backend 目录): python scripts/apply_settings_migration.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import text          # noqa: E402
from app.db import engine            # noqa: E402

SYS_SETTING = """
CREATE TABLE IF NOT EXISTS sys_setting (
  `key`      VARCHAR(64) NOT NULL,
  value      TEXT        NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

with engine.begin() as c:
    c.execute(text(SYS_SETTING))
    exists = c.execute(text(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema='smart' AND table_name='sys_setting'"
    )).scalar()
    print(f"sys_setting: {bool(exists)}")
