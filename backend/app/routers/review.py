from urllib.parse import quote as _urlquote

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlmodel import Session

from ..auth import require_api_key
from ..db import get_session
from ..report_builder import build_report_model
from ..reporting import package_zip, render_docx, render_pdf
from ..review_execution import (apply_review, bind_package_config, get_review_input,
                                get_review_results, review_action, ConflictError)
from ..schemas import (BindConfigIn, BindConfigResult, CheckOut, ReviewActionIn, ReviewApplyIn,
                       ReviewApplyResult, ReviewInput, ReviewResultOut)

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


@router.post("/packages/{package_id}/review", response_model=ReviewApplyResult,
             dependencies=[Depends(require_api_key)])
def post_review(package_id: int, body: ReviewApplyIn,
                db: Session = Depends(get_session)) -> ReviewApplyResult:
    try:
        return apply_review(db, package_id, body)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/packages/{package_id}/review", response_model=ReviewResultOut)
def get_review(package_id: int, db: Session = Depends(get_session)) -> ReviewResultOut:
    try:
        return get_review_results(db, package_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/round-checks/{round_check_id}/review-action", response_model=CheckOut,
             dependencies=[Depends(require_api_key)])
def post_review_action(round_check_id: int, body: ReviewActionIn,
                       db: Session = Depends(get_session)) -> CheckOut:
    try:
        return review_action(db, round_check_id, body.action, body.final_result,
                             body.final_disposition, body.remark, body.version)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


_DOCX_MEDIA = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@router.get("/packages/{package_id}/report/export")
def export_report(package_id: int, format: str = Query("zip"),
                  db: Session = Depends(get_session)) -> Response:
    try:
        m = build_report_model(db, package_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    base = f"立项审查报告_包{package_id}"

    def _resp(content: bytes, ext: str, media: str) -> Response:
        disposition = (f"attachment; filename=report_{package_id}.{ext}; "
                       f"filename*=UTF-8''{_urlquote(base + '.' + ext)}")
        return Response(content=content, media_type=media,
                        headers={"Content-Disposition": disposition})

    if format == "docx":
        return _resp(render_docx(m), "docx", _DOCX_MEDIA)
    if format == "pdf":
        return _resp(render_pdf(m), "pdf", "application/pdf")
    if format == "zip":
        zip_bytes = package_zip({f"{base}.docx": render_docx(m), f"{base}.pdf": render_pdf(m)})
        return _resp(zip_bytes, "zip", "application/zip")
    raise HTTPException(status_code=422, detail="format 仅支持 docx/pdf/zip")
