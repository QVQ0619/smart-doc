from sqlalchemy import text
from sqlmodel import Session

from app.db import engine
from app.models import FileObject, StandardDoc  # noqa: F401  # 确认实体可导入


def test_smart_test_schema_loaded_and_queryable(_test_db):
    with Session(engine) as s:
        # 清空后计数为 0，验证表存在且可查
        s.execute(text("SET FOREIGN_KEY_CHECKS=0"))
        s.execute(text("DELETE FROM standard_doc"))
        s.execute(text("DELETE FROM file_object"))
        s.execute(text("SET FOREIGN_KEY_CHECKS=1"))
        s.commit()
        n = s.execute(text("SELECT COUNT(*) FROM file_object")).scalar_one()
        assert n == 0
