import os

# 必须在导入 app 之前把 DB 指向 SQLite 内存库、存储目录指向占位值
os.environ["SMART_DATABASE_URL"] = "sqlite://"
os.environ.setdefault("SMART_STORAGE_DIR", "./_unused_test_storage")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402


@pytest.fixture
def storage_dir(tmp_path):
    return tmp_path / "uploads"


@pytest.fixture
def client(storage_dir):
    # 每个测试重建表，保证隔离
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(fastapi_app) as c:
        yield c
    fastapi_app.dependency_overrides.clear()
