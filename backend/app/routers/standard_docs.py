import mimetypes
import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import delete, select
from sqlmodel import Session

from ..auth import require_api_key
from ..config import get_max_upload_bytes
from ..db import engine, get_session
from ..models import BatchRuleDoc, FileObject, ParseSegment, RegulationClause, StandardDoc
from ..recognition import recognize_standard_doc
from ..structuring import delete_rules_for_doc
from ..schemas import ConflictItem, FailedItem, RecognizeResult, StandardDocOut, UploadResult
from ..storage import FileStorage, FileTooLargeError, get_storage

router = APIRouter(tags=["standard_docs"])


def _recognize_bg(doc_id: int, storage: FileStorage) -> None:
    """后台任务：用独立 Session 跑识别（请求 Session 已随响应关闭）。"""
    with Session(engine) as db:
        recognize_standard_doc(db, storage, doc_id)


def _to_out(sd: StandardDoc, fo: FileObject, *, segment_count=None, page_count=None, status=None) -> StandardDocOut:
    return StandardDocOut(
        id=sd.id,
        doc_code=sd.doc_code,
        title=sd.title,
        file_name=fo.file_name,
        size_bytes=fo.size_bytes,
        mime_type=fo.mime_type,
        created_at=sd.created_at,
        recognition_status=sd.recognition_status,
        segment_count=segment_count,
        page_count=page_count,
        status=status,
    )


@router.post("/standard-docs", response_model=UploadResult, dependencies=[Depends(require_api_key)])
def upload_standard_docs(
    files: list[UploadFile] = File(...),
    force: bool = False,
    replace: bool = False,
    background: BackgroundTasks = None,  # FastAPI 自动注入
    db: Session = Depends(get_session),
    storage: FileStorage = Depends(get_storage),
    max_bytes: int = Depends(get_max_upload_bytes),
) -> UploadResult:
    uploaded: list[StandardDocOut] = []
    failed: list[FailedItem] = []
    conflicts: list[ConflictItem] = []

    for up in files:
        name = up.filename or "unnamed"
        try:
            blob = storage.save("standard_doc", name, up.file, max_bytes)
        except FileTooLargeError as e:
            failed.append(FailedItem(name=name, reason=f"超过 {e.limit_bytes} 字节上限"))
            continue
        except Exception as e:  # noqa: BLE001
            failed.append(FailedItem(name=name, reason=f"落盘失败: {e}"))
            continue

        title = name.rsplit(".", 1)[0] if "." in name else name

        if not force:
            # 内容完全相同(同 content_hash)的在库文档 → 复用，不重复入库
            dup = db.execute(
                select(StandardDoc, FileObject)
                .join(FileObject, StandardDoc.file_id == FileObject.id)
                .where(StandardDoc.is_active == True, FileObject.deleted_at == None,  # noqa: E712
                       FileObject.content_hash == blob.sha256)
            ).first()
            if dup is not None:
                storage.delete(blob.object_key)        # 删掉刚落盘的重复副本
                sd, fo = dup
                uploaded.append(_to_out(sd, fo, status="reused"))
                continue
            # 同名(title 相同)但内容不同 = 更新版 → 冲突，交调用方决定(更新/另存)
            same_title = db.execute(
                select(StandardDoc, FileObject)
                .join(FileObject, StandardDoc.file_id == FileObject.id)
                .where(StandardDoc.is_active == True, FileObject.deleted_at == None,  # noqa: E712
                       StandardDoc.title == title)
            ).first()
            if same_title is not None:
                storage.delete(blob.object_key)
                esd, _efo = same_title
                conflicts.append(ConflictItem(
                    name=name, existing_doc_code=esd.doc_code, existing_title=esd.title,
                ))
                continue

        if force and replace:
            # 更新语义：软删同名的 active 文档(旧版隐藏、其条款/规则随之不再显示)，再新建
            olds = db.execute(
                select(StandardDoc, FileObject)
                .join(FileObject, StandardDoc.file_id == FileObject.id)
                .where(StandardDoc.is_active == True, FileObject.deleted_at == None,  # noqa: E712
                       StandardDoc.title == title)
            ).all()
            for osd, ofo in olds:
                osd.is_active = False
                ofo.deleted_at = datetime.now()
                db.add(osd)
                db.add(ofo)
            if olds:
                db.commit()

        try:
            fo = FileObject(
                bucket="local",
                object_key=blob.object_key,
                file_name=name,
                mime_type=up.content_type,
                size_bytes=blob.size_bytes,
                content_hash=blob.sha256,
                sensitivity="内部",
            )
            db.add(fo)
            db.flush()          # assigns fo.id WITHOUT committing

            sd = StandardDoc(
                doc_code=f"SD-{uuid.uuid4().hex[:12]}",
                title=title,
                version="V1.0",
                file_id=fo.id,
                is_active=True,
            )
            db.add(sd)
            db.commit()         # single commit for both
            db.refresh(sd)
            db.refresh(fo)      # ensure fo fields (e.g. created_at) are loaded for _to_out
        except Exception as e:  # noqa: BLE001
            db.rollback()
            storage.delete(blob.object_key)
            failed.append(FailedItem(name=name, reason=f"入库失败: {e}"))
            continue

        sd.recognition_status = "processing"
        db.add(sd)
        db.commit()
        db.refresh(sd)
        background.add_task(_recognize_bg, sd.id, storage)
        uploaded.append(_to_out(sd, fo, segment_count=None, page_count=None, status="created"))

    return UploadResult(uploaded=uploaded, failed=failed, conflicts=conflicts)


@router.get("/standard-docs", response_model=list[StandardDocOut])
def list_standard_docs(db: Session = Depends(get_session)) -> list[StandardDocOut]:
    rows = db.execute(
        select(StandardDoc, FileObject)
        .join(FileObject, StandardDoc.file_id == FileObject.id)
        .where(StandardDoc.is_active == True, FileObject.deleted_at == None)  # noqa: E712
        .order_by(StandardDoc.created_at.desc(), StandardDoc.id.desc())
    ).all()
    return [_to_out(sd, fo) for sd, fo in rows]


@router.post("/standard-docs/{doc_id}/recognize", response_model=RecognizeResult, dependencies=[Depends(require_api_key)])
def recognize_endpoint(
    doc_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_session),
    storage: FileStorage = Depends(get_storage),
) -> RecognizeResult:
    sd = db.get(StandardDoc, doc_id)
    if sd is None or not sd.is_active:
        raise HTTPException(status_code=404, detail="standard_doc not found")
    sd.recognition_status = "processing"
    sd.recognition_error = None
    db.add(sd)
    db.commit()
    db.refresh(sd)
    background.add_task(_recognize_bg, doc_id, storage)
    return RecognizeResult(
        doc_id=doc_id, doc_code=sd.doc_code, recognition_status="processing",
        segment_count=0, page_count=None, error=None,
    )


@router.get("/standard-docs/{doc_id}/download")
def download_standard_doc(
    doc_id: int,
    db: Session = Depends(get_session),
    storage: FileStorage = Depends(get_storage),
):
    sd = db.get(StandardDoc, doc_id)
    if sd is None or not sd.is_active:
        raise HTTPException(status_code=404, detail="standard_doc not found")
    fo = db.get(FileObject, sd.file_id) if sd.file_id else None
    if fo is None or fo.deleted_at is not None:
        raise HTTPException(status_code=404, detail="file_object missing")
    path = storage.base_dir / fo.object_key
    if not path.exists():
        raise HTTPException(status_code=404, detail="file missing on disk")
    # inline + 按扩展名推断 media_type：浏览器内预览(PDF/图片)而非强制下载；
    # 入库 mime 常为 octet-stream(agent/shim 上传)，扩展名推断更可靠。无法内联的类型(如 docx)浏览器仍会下载。
    media_type = mimetypes.guess_type(fo.file_name)[0] or fo.mime_type or "application/octet-stream"
    return FileResponse(path, filename=fo.file_name, media_type=media_type,
                        content_disposition_type="inline")


@router.delete("/standard-docs/{doc_id}", status_code=204, dependencies=[Depends(require_api_key)])
def delete_standard_doc(doc_id: int, db: Session = Depends(get_session)):
    sd = db.get(StandardDoc, doc_id)
    if sd is None or not sd.is_active:
        raise HTTPException(status_code=404, detail="standard_doc not found")
    # 物理级联删除：严格按 FK RESTRICT 顺序（规则全链 → 条款 → 段落 → 批次关联 → 文档本身）
    delete_rules_for_doc(db, doc_id)
    db.execute(delete(RegulationClause).where(RegulationClause.standard_doc_id == doc_id))
    db.execute(delete(ParseSegment).where(ParseSegment.standard_doc_id == doc_id))
    db.execute(delete(BatchRuleDoc).where(BatchRuleDoc.standard_doc_id == doc_id))
    if sd.file_id:
        fo = db.get(FileObject, sd.file_id)
        if fo is not None:
            fo.deleted_at = datetime.now()  # file_object 维持软删
            db.add(fo)
    db.delete(sd)  # 物理删 standard_doc
    db.commit()
