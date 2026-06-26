from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from ..auth import require_api_key
from ..db import get_session
from ..batches import create_batch, list_batches
from ..schemas import BatchCreateIn, BatchOut

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
