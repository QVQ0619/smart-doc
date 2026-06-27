from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from ..auth import require_api_key
from ..db import get_session
from ..batches import (bind_rule_docs, create_batch, get_batch_detail,
                       list_batch_standard_docs, list_batches, unbind_rule_doc)
from ..schemas import (BatchCreateIn, BatchDetailOut, BatchOut,
                       BindRuleDocsIn, BindRuleDocsResult,
                       MaterialPackageOut, StandardDocOut)

router = APIRouter(tags=["batches"])


@router.get("/batches", response_model=list[BatchOut])
def get_batches(db: Session = Depends(get_session)) -> list[BatchOut]:
    return list_batches(db)


@router.post("/batches", response_model=BatchOut, dependencies=[Depends(require_api_key)])
def post_batch(body: BatchCreateIn, db: Session = Depends(get_session)) -> BatchOut:
    try:
        return create_batch(db, body)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/batches/{batch_id}", response_model=BatchDetailOut)
def get_batch(batch_id: int, db: Session = Depends(get_session)) -> BatchDetailOut:
    try:
        return get_batch_detail(db, batch_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/batches/{batch_id}/bind-rule-docs", response_model=BindRuleDocsResult,
             dependencies=[Depends(require_api_key)])
def post_bind_rule_docs(batch_id: int, body: BindRuleDocsIn,
                        db: Session = Depends(get_session)) -> BindRuleDocsResult:
    try:
        n = bind_rule_docs(db, batch_id, body.standard_doc_ids)
        return BindRuleDocsResult(bound_count=n)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/batches/{batch_id}/standard-docs", response_model=list[StandardDocOut])
def get_batch_standard_docs(batch_id: int,
                             db: Session = Depends(get_session)) -> list[StandardDocOut]:
    return list_batch_standard_docs(db, batch_id)


@router.delete("/batches/{batch_id}/standard-docs/{doc_id}", status_code=204,
               dependencies=[Depends(require_api_key)])
def delete_batch_standard_doc(batch_id: int, doc_id: int,
                              db: Session = Depends(get_session)) -> None:
    if not unbind_rule_doc(db, batch_id, doc_id):
        raise HTTPException(status_code=404, detail="binding not found")


@router.get("/batches/{batch_id}/packages", response_model=list[MaterialPackageOut])
def get_batch_packages(batch_id: int,
                       db: Session = Depends(get_session)) -> list[MaterialPackageOut]:
    from ..materials import list_packages
    return list_packages(db, batch_id=batch_id)
