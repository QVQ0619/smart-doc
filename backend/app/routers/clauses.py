from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlmodel import Session

from ..db import get_session
from ..extraction import replace_clauses
from ..models import (ParseSegment, RegulationClause, ReviewDimension, ReviewRule,
                      ReviewRuleClause, ReviewRuleVersion, StandardDoc)
from ..schemas import (ClauseBatchIn, ClauseOut, ClauseWriteResult, RuleBatchIn,
                       RuleOut, RuleWriteResult, SegmentOut)
from ..structuring import replace_rules

router = APIRouter(tags=["clauses"])


def _require_doc(db: Session, doc_id: int) -> StandardDoc:
    sd = db.get(StandardDoc, doc_id)
    if sd is None or not sd.is_active:
        raise HTTPException(status_code=404, detail="standard_doc not found")
    return sd


@router.get("/standard-docs/{doc_id}/segments", response_model=list[SegmentOut])
def list_segments(doc_id: int, db: Session = Depends(get_session)) -> list[SegmentOut]:
    _require_doc(db, doc_id)
    rows = db.execute(
        select(ParseSegment).where(ParseSegment.standard_doc_id == doc_id).order_by(ParseSegment.id)
    ).scalars().all()
    return [
        SegmentOut(id=s.id, page_no=s.page_no, locator=s.locator, segment_type=s.segment_type, content_text=s.content_text)
        for s in rows
    ]


@router.post("/standard-docs/{doc_id}/clauses", response_model=ClauseWriteResult)
def post_clauses(doc_id: int, body: ClauseBatchIn, db: Session = Depends(get_session)) -> ClauseWriteResult:
    _require_doc(db, doc_id)
    return replace_clauses(db, doc_id, body.clauses)


@router.get("/standard-docs/{doc_id}/clauses", response_model=list[ClauseOut])
def list_clauses(doc_id: int, db: Session = Depends(get_session)) -> list[ClauseOut]:
    _require_doc(db, doc_id)
    rows = db.execute(
        select(RegulationClause, ParseSegment)
        .outerjoin(ParseSegment, RegulationClause.source_segment_id == ParseSegment.id)
        .where(RegulationClause.standard_doc_id == doc_id)
        .order_by(RegulationClause.id)
    ).all()
    return [
        ClauseOut(
            id=rc.id, clause_no=rc.clause_no, clause_text=rc.clause_text,
            source_segment_id=rc.source_segment_id,
            page_no=(ps.page_no if ps else None),
            locator=(ps.locator if ps else None),
        )
        for rc, ps in rows
    ]


@router.post("/standard-docs/{doc_id}/rules", response_model=RuleWriteResult)
def post_rules(doc_id: int, body: RuleBatchIn, db: Session = Depends(get_session)) -> RuleWriteResult:
    _require_doc(db, doc_id)
    return replace_rules(db, doc_id, body.rules)


@router.get("/standard-docs/{doc_id}/rules", response_model=list[RuleOut])
def list_rules(doc_id: int, db: Session = Depends(get_session)) -> list[RuleOut]:
    _require_doc(db, doc_id)
    rows = db.execute(
        select(ReviewRule, ReviewRuleVersion, ReviewDimension, RegulationClause, ParseSegment)
        .join(ReviewRuleVersion, ReviewRule.current_version_id == ReviewRuleVersion.id)
        .join(ReviewDimension, ReviewRuleVersion.dimension_id == ReviewDimension.id)
        .join(ReviewRuleClause, ReviewRuleClause.rule_version_id == ReviewRuleVersion.id)
        .join(RegulationClause, ReviewRuleClause.clause_id == RegulationClause.id)
        .outerjoin(ParseSegment, RegulationClause.source_segment_id == ParseSegment.id)
        .where(RegulationClause.standard_doc_id == doc_id, ReviewRule.is_active == True)  # noqa: E712
        .order_by(ReviewRule.id)
    ).all()
    return [
        RuleOut(
            id=rr.id, rule_code=rr.rule_code, version=rv.version, name=rv.name, logic=rv.logic,
            dimension_code=dim.code, dimension_name=dim.name,
            decision_type=rv.decision_type, disposition=rv.disposition, binding_class=rv.binding_class,
            source_clause_id=rc.id, clause_no=rc.clause_no, clause_text=rc.clause_text,
            page_no=(ps.page_no if ps else None), locator=(ps.locator if ps else None),
        )
        for rr, rv, dim, rc, ps in rows
    ]
