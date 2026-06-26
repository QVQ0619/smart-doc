from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlmodel import Session

from ..auth import require_api_key
from ..config import get_max_upload_bytes
from ..db import engine, get_session
from ..materials import create_review_package, ensure_default_master_data
from ..material_extraction import replace_package_extraction
from ..models import (ApplicationPackage, BudgetItem, ExtractedField, FileObject,
                      MaterialFile, PackageAttachment, PackageCoopUnit, PackageMember,
                      ParseSegment)
from ..recognition import recognize_material_file
from ..schemas import (AttachmentOut, BudgetItemOut, CoopUnitOut, FailedItem, FieldOut,
                       MaterialExtractPayload, MaterialExtractResult, MaterialFileBrief,
                       MaterialFileSegmentsOut, MaterialItemOut, MaterialPackageOut,
                       MaterialRecognizeResult, MaterialUploadResult, MemberOut,
                       PackageStructuredOut, SegmentOut)
from ..storage import FileStorage, FileTooLargeError, get_storage

router = APIRouter(tags=["material_files"])


def _recognize_bg(material_file_id: int, storage: FileStorage) -> None:
    with Session(engine) as db:
        recognize_material_file(db, storage, material_file_id)


@router.post("/material-files", response_model=MaterialUploadResult,
             dependencies=[Depends(require_api_key)])
def upload_material_files(
    files: list[UploadFile] = File(...),
    package_id: int | None = Form(default=None),
    material_category: str = Form(default="application_form"),  # chk_mf_cat 白名单: application_form/budget/cv/research_plan/attachment
    background: BackgroundTasks = None,
    db: Session = Depends(get_session),
    storage: FileStorage = Depends(get_storage),
    max_bytes: int = Depends(get_max_upload_bytes),
) -> MaterialUploadResult:
    if package_id is not None:
        pkg = db.get(ApplicationPackage, package_id)
        if pkg is None:
            raise HTTPException(status_code=404, detail="application_package not found")
    else:
        package_id = create_review_package(db)

    secrecy_id = ensure_default_master_data(db).secrecy_level_id
    items: list[MaterialItemOut] = []
    failed: list[FailedItem] = []
    for up in files:
        name = up.filename or "unnamed"
        try:
            blob = storage.save("material", name, up.file, max_bytes)
        except FileTooLargeError as e:
            failed.append(FailedItem(name=name, reason=f"超过 {e.limit_bytes} 字节上限"))
            continue
        except Exception as e:  # noqa: BLE001
            failed.append(FailedItem(name=name, reason=f"落盘失败: {e}"))
            continue
        try:
            fo = FileObject(bucket="local", object_key=blob.object_key, file_name=name,
                            mime_type=up.content_type, size_bytes=blob.size_bytes,
                            content_hash=blob.sha256, sensitivity="内部")
            db.add(fo); db.flush()
            ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
            mf = MaterialFile(package_id=package_id, round_no=1, material_category=material_category,
                              file_name=name, file_format=ext, file_id=fo.id,
                              secrecy_level_id=secrecy_id, recognition_status="processing")
            db.add(mf); db.commit(); db.refresh(mf)
        except Exception as e:  # noqa: BLE001
            db.rollback()
            storage.delete(blob.object_key)
            failed.append(FailedItem(name=name, reason=f"入库失败: {e}"))
            continue
        background.add_task(_recognize_bg, mf.id, storage)
        items.append(MaterialItemOut(material_file_id=mf.id, file_name=name,
                                     material_category=material_category,
                                     recognition_status="processing"))
    return MaterialUploadResult(package_id=package_id, items=items, failed=failed)


@router.get("/material-packages", response_model=list[MaterialPackageOut])
def list_material_packages(db: Session = Depends(get_session)) -> list[MaterialPackageOut]:
    pkgs = db.execute(select(ApplicationPackage).order_by(ApplicationPackage.id.desc())).scalars().all()
    out: list[MaterialPackageOut] = []
    for pkg in pkgs:
        mfs = db.execute(select(MaterialFile).where(MaterialFile.package_id == pkg.id)
                         .order_by(MaterialFile.id)).scalars().all()
        if not mfs:
            continue  # 只列有材料的包
        briefs: list[MaterialFileBrief] = []
        for mf in mfs:
            seg_count = db.execute(select(func.count()).select_from(ParseSegment)
                                   .where(ParseSegment.material_file_id == mf.id)).scalar_one()
            briefs.append(MaterialFileBrief(
                material_file_id=mf.id, file_name=mf.file_name,
                material_category=mf.material_category,
                recognition_status=mf.recognition_status, segment_count=seg_count))
        out.append(MaterialPackageOut(package_id=pkg.id, created_at=pkg.created_at,
                                      file_count=len(briefs), files=briefs))
    return out


@router.get("/material-files/{material_file_id}/segments", response_model=list[SegmentOut])
def list_material_segments(material_file_id: int, db: Session = Depends(get_session)) -> list[SegmentOut]:
    rows = db.execute(select(ParseSegment).where(ParseSegment.material_file_id == material_file_id)
                      .order_by(ParseSegment.id)).scalars().all()
    return [SegmentOut(id=s.id, page_no=s.page_no, locator=s.locator,
                       segment_type=s.segment_type, content_text=s.content_text) for s in rows]


@router.post("/material-files/{material_file_id}/recognize", response_model=MaterialRecognizeResult,
             dependencies=[Depends(require_api_key)])
def recognize_material_endpoint(material_file_id: int, background: BackgroundTasks,
                                db: Session = Depends(get_session),
                                storage: FileStorage = Depends(get_storage)) -> MaterialRecognizeResult:
    mf = db.get(MaterialFile, material_file_id)
    if mf is None:
        raise HTTPException(status_code=404, detail="material_file not found")
    mf.recognition_status = "processing"
    mf.recognition_error = None
    db.add(mf); db.commit()
    background.add_task(_recognize_bg, material_file_id, storage)
    return MaterialRecognizeResult(material_file_id=material_file_id, recognition_status="processing",
                                   segment_count=0, page_count=None, error=None)


@router.get("/packages/{package_id}/segments", response_model=list[MaterialFileSegmentsOut])
def list_package_segments(package_id: int, db: Session = Depends(get_session)) -> list[MaterialFileSegmentsOut]:
    if db.get(ApplicationPackage, package_id) is None:
        raise HTTPException(status_code=404, detail="application_package not found")
    from ..material_extraction import build_package_segments
    return build_package_segments(db, package_id)


@router.post("/packages/{package_id}/extract", response_model=MaterialExtractResult,
             dependencies=[Depends(require_api_key)])
def extract_package(package_id: int, body: MaterialExtractPayload,
                    db: Session = Depends(get_session)) -> MaterialExtractResult:
    try:
        return replace_package_extraction(db, package_id, body)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/packages/{package_id}/structured", response_model=PackageStructuredOut)
def get_package_structured(package_id: int, db: Session = Depends(get_session)) -> PackageStructuredOut:
    if db.get(ApplicationPackage, package_id) is None:
        raise HTTPException(status_code=404, detail="application_package not found")
    from ..material_extraction import build_package_structured
    return build_package_structured(db, package_id)


@router.get("/material-files/{material_file_id}/download")
def download_material_file(
    material_file_id: int,
    db: Session = Depends(get_session),
    storage: FileStorage = Depends(get_storage),
):
    mf = db.get(MaterialFile, material_file_id)
    if mf is None:
        raise HTTPException(status_code=404, detail="material_file not found")
    fo = db.get(FileObject, mf.file_id) if mf.file_id else None
    if fo is None or fo.deleted_at is not None:
        raise HTTPException(status_code=404, detail="file_object missing")
    path = storage.base_dir / fo.object_key
    if not path.exists():
        raise HTTPException(status_code=404, detail="file missing on disk")
    return FileResponse(path, filename=fo.file_name, media_type=fo.mime_type or "application/octet-stream")
