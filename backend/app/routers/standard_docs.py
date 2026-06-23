import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlmodel import Session

from ..auth import require_api_key
from ..config import get_max_upload_bytes
from ..db import get_session
from ..models import FileObject, StandardDoc
from ..recognition import recognize_standard_doc
from ..schemas import ConflictItem, FailedItem, RecognizeResult, StandardDocOut, UploadResult
from ..storage import FileStorage, FileTooLargeError, get_storage

router = APIRouter(tags=["standard_docs"])


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

        rec = None
        try:
            rec = recognize_standard_doc(db, storage, sd.id)
            db.refresh(sd)
        except Exception:  # noqa: BLE001  双保险：识别异常绝不影响上传结果
            pass
        uploaded.append(_to_out(
            sd, fo,
            segment_count=rec.segment_count if rec else None,
            page_count=rec.page_count if rec else None,
            status="created",
        ))

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
    db: Session = Depends(get_session),
    storage: FileStorage = Depends(get_storage),
) -> RecognizeResult:
    sd = db.get(StandardDoc, doc_id)
    if sd is None or not sd.is_active:
        raise HTTPException(status_code=404, detail="standard_doc not found")
    return recognize_standard_doc(db, storage, doc_id)


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
    return FileResponse(path, filename=fo.file_name, media_type=fo.mime_type or "application/octet-stream")


@router.delete("/standard-docs/{doc_id}", status_code=204, dependencies=[Depends(require_api_key)])
def delete_standard_doc(doc_id: int, db: Session = Depends(get_session)):
    sd = db.get(StandardDoc, doc_id)
    if sd is None or not sd.is_active:
        raise HTTPException(status_code=404, detail="standard_doc not found")
    sd.is_active = False
    if sd.file_id:
        fo = db.get(FileObject, sd.file_id)
        if fo is not None:
            fo.deleted_at = datetime.now()  # 本地基准, 与 created_at 的 CURRENT_TIMESTAMP 一致
            db.add(fo)
    db.add(sd)
    db.commit()
