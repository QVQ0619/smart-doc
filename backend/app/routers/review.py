from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from ..auth import require_api_key
from ..db import get_session
from ..review_execution import bind_package_config, get_review_input
from ..schemas import BindConfigIn, BindConfigResult, ReviewInput

router = APIRouter(tags=["review"])


@router.post("/packages/{package_id}/bind-config", response_model=BindConfigResult,
             dependencies=[Depends(require_api_key)])
def bind_config(package_id: int, body: BindConfigIn,
                db: Session = Depends(get_session)) -> BindConfigResult:
    try:
        config_id, rule_count = bind_package_config(db, package_id, body.config_doc_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return BindConfigResult(config_id=config_id, rule_count=rule_count)


@router.get("/packages/{package_id}/review-input", response_model=ReviewInput)
def review_input(package_id: int, db: Session = Depends(get_session)) -> ReviewInput:
    try:
        return get_review_input(db, package_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
