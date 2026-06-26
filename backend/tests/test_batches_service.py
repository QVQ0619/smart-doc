import pytest
from sqlmodel import Session

from app.db import engine
from app.materials import ensure_default_master_data
from app.models import StandardDoc
from app.batches import bind_rule_docs, list_batch_rule_docs


# --------------------------------------------------------------------------- #
# 辅助函数
# --------------------------------------------------------------------------- #

def _make_doc(db: Session, code: str) -> int:
    """幂等写一条 StandardDoc，返回 id（flush 获取，不单独 commit）。"""
    doc = StandardDoc(doc_code=code, title=f"规则文件-{code}")
    db.add(doc)
    db.flush()
    return doc.id


def _make_batch(db: Session) -> int:
    """用占位主数据创建默认批次，返回 batch_id。"""
    refs = ensure_default_master_data(db)
    return refs.batch_id


# --------------------------------------------------------------------------- #
# 测试用例
# --------------------------------------------------------------------------- #

def test_bind_and_list(client):
    """绑定写入：建 1 批次 + 2 规则文件 → bind 返回 2；list 返回 [d1,d2]。"""
    with Session(engine) as db:
        b = _make_batch(db)
        d1 = _make_doc(db, "DOC-A")
        d2 = _make_doc(db, "DOC-B")
        db.commit()

        n = bind_rule_docs(db, b, [d1, d2])
        assert n == 2
        lst = list_batch_rule_docs(db, b)
        assert sorted(lst) == sorted([d1, d2])


def test_idempotent_rebind(client):
    """幂等重绑：再 bind [d1] → 返回 1，list 只剩 [d1]（旧 d2 被清）。"""
    with Session(engine) as db:
        b = _make_batch(db)
        d1 = _make_doc(db, "DOC-C")
        d2 = _make_doc(db, "DOC-D")
        db.commit()

        bind_rule_docs(db, b, [d1, d2])
        n = bind_rule_docs(db, b, [d1])
        assert n == 1
        lst = list_batch_rule_docs(db, b)
        assert lst == [d1]


def test_unbind_all(client):
    """解绑全部：bind [] → 返回 0，list 为空。"""
    with Session(engine) as db:
        b = _make_batch(db)
        d1 = _make_doc(db, "DOC-E")
        db.commit()

        bind_rule_docs(db, b, [d1])
        n = bind_rule_docs(db, b, [])
        assert n == 0
        lst = list_batch_rule_docs(db, b)
        assert lst == []


def test_dedup(client):
    """去重：bind [d1, d1] → 返回 1。"""
    with Session(engine) as db:
        b = _make_batch(db)
        d1 = _make_doc(db, "DOC-F")
        db.commit()

        n = bind_rule_docs(db, b, [d1, d1])
        assert n == 1


def test_unknown_batch_raises(client):
    """未知批次 → LookupError。"""
    with Session(engine) as db:
        with pytest.raises(LookupError):
            bind_rule_docs(db, 999999, [])


def test_unknown_doc_raises(client):
    """未知规则文件 → LookupError。"""
    with Session(engine) as db:
        b = _make_batch(db)

    with Session(engine) as db:
        with pytest.raises(LookupError):
            bind_rule_docs(db, b, [999999])
