import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from sqlmodel import Session

from ..config import get_max_upload_bytes
from ..db import get_session
from ..models import FileObject, StandardDoc
from ..schemas import FailedItem, StandardDocOut, UploadResult
from ..storage import FileStorage, FileTooLargeError, get_storage

router = APIRouter(tags=["standard_docs"])


def _to_out(sd: StandardDoc, fo: FileObject) -> StandardDocOut:
    return StandardDocOut(
        id=sd.id,
        doc_code=sd.doc_code,
        title=sd.title,
        file_name=fo.file_name,
        size_bytes=fo.size_bytes,
        mime_type=fo.mime_type,
        created_at=sd.created_at,
    )


@router.post("/standard-docs", response_model=UploadResult)
def upload_standard_docs(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_session),
    storage: FileStorage = Depends(get_storage),
    max_bytes: int = Depends(get_max_upload_bytes),
) -> UploadResult:
    uploaded: list[StandardDocOut] = []
    failed: list[FailedItem] = []

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
            db.commit()
            db.refresh(fo)

            title = name.rsplit(".", 1)[0] if "." in name else name
            sd = StandardDoc(
                doc_code=f"SD-{uuid.uuid4().hex[:12]}",
                title=title,
                version="V1.0",
                file_id=fo.id,
                is_active=True,
            )
            db.add(sd)
            db.commit()
            db.refresh(sd)
        except Exception as e:  # noqa: BLE001
            db.rollback()
            storage.delete(blob.object_key)
            failed.append(FailedItem(name=name, reason=f"入库失败: {e}"))
            continue

        uploaded.append(_to_out(sd, fo))

    return UploadResult(uploaded=uploaded, failed=failed)
