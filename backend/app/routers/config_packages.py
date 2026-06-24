from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlmodel import Session

from ..db import get_session
from ..models import (RegulationClause, ReviewDimension, ReviewRule,
                      ReviewRuleClause, ReviewRuleVersion, StandardDoc)
from ..schemas import ConfigPackageOut

router = APIRouter(tags=["config-packages"])


@router.get("/config-packages", response_model=list[ConfigPackageOut])
def list_config_packages(db: Session = Depends(get_session)) -> list[ConfigPackageOut]:
    """每个含有效规则的 standard_doc = 一个只读配置包。

    口径与 routers.clauses.list_rules 完全一致:同一条 join、同样 is_active 过滤;
    在文档维度上 GROUP BY,规则数取 distinct review_rule.id,维度去重保序。
    """
    rows = db.execute(
        select(
            StandardDoc.id, StandardDoc.doc_code, StandardDoc.title, StandardDoc.version,
            ReviewRule.id, ReviewDimension.name,
        )
        .join(RegulationClause, RegulationClause.standard_doc_id == StandardDoc.id)
        .join(ReviewRuleClause, ReviewRuleClause.clause_id == RegulationClause.id)
        .join(ReviewRuleVersion, ReviewRuleVersion.id == ReviewRuleClause.rule_version_id)
        .join(ReviewRule, ReviewRule.current_version_id == ReviewRuleVersion.id)
        .join(ReviewDimension, ReviewDimension.id == ReviewRuleVersion.dimension_id)
        .where(StandardDoc.is_active == True, ReviewRule.is_active == True)  # noqa: E712
        .order_by(StandardDoc.id)
    ).all()

    packages: dict[int, dict] = {}
    for doc_id, doc_code, title, version, rule_id, dim_name in rows:
        pkg = packages.get(doc_id)
        if pkg is None:
            pkg = {"doc_id": doc_id, "doc_code": doc_code, "title": title,
                   "version": version, "rule_ids": set(), "dimensions": []}
            packages[doc_id] = pkg
        pkg["rule_ids"].add(rule_id)
        if dim_name not in pkg["dimensions"]:
            pkg["dimensions"].append(dim_name)

    return [
        ConfigPackageOut(
            doc_id=p["doc_id"], doc_code=p["doc_code"], title=p["title"],
            version=p["version"], rule_count=len(p["rule_ids"]), dimensions=p["dimensions"],
        )
        for p in packages.values()
    ]
