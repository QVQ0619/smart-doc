from sqlalchemy import text as sqltext
from sqlmodel import Session

from app.db import engine
from app.dimensions import ensure_dimensions


def _clear():
    with Session(engine) as s:
        s.execute(sqltext("SET FOREIGN_KEY_CHECKS=0"))
        s.execute(sqltext("DELETE FROM review_dimension"))
        s.execute(sqltext("SET FOREIGN_KEY_CHECKS=1"))
        s.commit()


def _count():
    with Session(engine) as s:
        return s.execute(sqltext("SELECT COUNT(*) FROM review_dimension")).scalar_one()


def test_ensure_dimensions_seeds_six(_test_db):
    _clear()
    with Session(engine) as db:
        ensure_dimensions(db)
    assert _count() == 6


def test_ensure_dimensions_idempotent(_test_db):
    _clear()
    with Session(engine) as db:
        ensure_dimensions(db)
    with Session(engine) as db:
        ensure_dimensions(db)   # 再调一次
    assert _count() == 6        # 不重复插


def test_ensure_dimensions_codes(_test_db):
    _clear()
    with Session(engine) as db:
        ensure_dimensions(db)
    with Session(engine) as s:
        codes = set(s.execute(sqltext("SELECT code FROM review_dimension")).scalars().all())
    assert codes == {"completeness", "normativeness", "compliance",
                     "consistency", "rationality", "authenticity"}
