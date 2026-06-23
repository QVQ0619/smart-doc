from __future__ import annotations

from sqlalchemy import select
from sqlmodel import Session

from .models import ReviewDimension

DIMENSIONS: list[tuple[str, str]] = [
    ("completeness", "完整性"),
    ("normativeness", "规范性"),
    ("compliance", "合规性"),
    ("consistency", "一致性"),
    ("rationality", "合理性"),
    ("authenticity", "真实性"),
]


def ensure_dimensions(db: Session) -> None:
    """幂等：按 code 补插缺失的 review_dimension 行，已存在不动。单次 commit。"""
    existing = set(db.execute(select(ReviewDimension.code)).scalars().all())
    added = False
    for code, name in DIMENSIONS:
        if code not in existing:
            db.add(ReviewDimension(code=code, name=name))
            added = True
    if added:
        db.commit()
