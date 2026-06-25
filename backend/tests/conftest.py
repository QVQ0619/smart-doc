import os
import subprocess
import tempfile
from pathlib import Path

# 测试连 smart_test，绝不连 smart 生产库；env 必须在导入 app 之前设置
os.environ["SMART_DATABASE_URL"] = "mysql+pymysql://root:root@localhost:3306/smart_test"
os.environ.setdefault("SMART_STORAGE_DIR", "./_unused_test_storage")
# 测试默认不鉴权（覆盖 backend/.env 里可能存在的 SMART_API_KEY）；test_auth 自行 monkeypatch 开启
os.environ["SMART_API_KEY"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlmodel import Session  # noqa: E402

from app.db import engine  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_SQL = REPO_ROOT / "docs" / "file" / "审查系统-schema_mysql.sql"


def _load_test_schema() -> None:
    subprocess.run(
        [
            "mysql", "--default-character-set=utf8mb4", "-uroot", "-proot", "-e",
            "DROP DATABASE IF EXISTS smart_test; "
            "CREATE DATABASE smart_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;",
        ],
        check=True,
    )
    sql = SCHEMA_SQL.read_text(encoding="utf-8")
    sql = sql.replace(
        "CREATE DATABASE IF NOT EXISTS smart\n",
        "CREATE DATABASE IF NOT EXISTS smart_test\n",
    ).replace("USE smart;", "USE smart_test;")
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as tf:
        tf.write(sql)
        tmp = tf.name
    try:
        with open(tmp, "rb") as fh:
            subprocess.run(
                ["mysql", "--default-character-set=utf8mb4", "-uroot", "-proot"],
                stdin=fh, check=True,
            )
    finally:
        os.unlink(tmp)


@pytest.fixture(scope="session")
def _test_db():
    _load_test_schema()
    yield


@pytest.fixture
def storage_dir(tmp_path):
    return tmp_path / "storage"


@pytest.fixture
def client(_test_db, storage_dir):
    from app.storage import FileStorage, get_storage

    # 清理本期涉及的表（外键约束顺序：先断循环引用，再逐层删子表）
    with Session(engine) as s:
        s.execute(text("DELETE FROM extracted_field"))
        s.execute(text("DELETE FROM package_member"))
        s.execute(text("DELETE FROM package_coop_unit"))
        s.execute(text("DELETE FROM budget_item"))   # 扁平无自引用，整表删安全
        s.execute(text("DELETE FROM package_attachment"))
        s.execute(text("DELETE FROM form_field"))
        s.execute(text("DELETE FROM form_template"))
        s.execute(text("DELETE FROM review_rule_clause"))
        s.execute(text("UPDATE review_rule SET current_version_id=NULL"))
        s.execute(text("DELETE FROM review_rule_version"))
        s.execute(text("DELETE FROM review_rule"))
        s.execute(text("DELETE FROM regulation_clause"))
        s.execute(text("DELETE FROM parse_segment"))
        s.execute(text("DELETE FROM material_file"))
        s.execute(text("DELETE FROM application_package"))
        s.execute(text("DELETE FROM review_batch"))
        s.execute(text("DELETE FROM declared_project"))
        s.execute(text("DELETE FROM standard_doc"))
        s.execute(text("DELETE FROM file_object"))
        s.commit()

    fastapi_app.dependency_overrides[get_storage] = lambda: FileStorage(storage_dir)
    with TestClient(fastapi_app) as c:
        yield c
    fastapi_app.dependency_overrides.clear()
