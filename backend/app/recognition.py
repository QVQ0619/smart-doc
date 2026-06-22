from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import pdfplumber
from docx import Document
from sqlalchemy import delete
from sqlmodel import Session

from .models import FileObject, ParseSegment, StandardDoc
from .schemas import RecognizeResult
from .storage import FileStorage

MAX_SEGMENT_CHARS = 65536

# DB 约束：segment_type IN ('text','table','title','figure')
_SEGMENT_TYPE_MAP = {"heading": "title", "paragraph": "text"}


@dataclass
class SegmentDraft:
    page_no: int | None
    locator: dict
    segment_type: str  # heading | paragraph | table
    content_text: str


class UnsupportedFormatError(Exception):
    def __init__(self, ext: str):
        self.ext = ext
        super().__init__(f"unsupported format: {ext}")


def _clip(text: str) -> str:
    return text if len(text) <= MAX_SEGMENT_CHARS else text[:MAX_SEGMENT_CHARS]


def _rows_to_text(rows) -> str:
    lines = [" | ".join((c or "").strip() for c in row) for row in rows]
    return "\n".join(lines).strip()


def parse_pdf(path: Path) -> list[SegmentDraft]:
    drafts: list[SegmentDraft] = []
    with pdfplumber.open(str(path)) as pdf:
        for pageno, page in enumerate(pdf.pages, start=1):
            tables = page.find_tables()
            text_region = page
            for t in tables:
                text_region = text_region.outside_bbox(t.bbox)
            text = text_region.extract_text() or ""
            blocks = [b.strip() for b in re.split(r"\n\s*\n", text) if b.strip()]
            for bi, block in enumerate(blocks):
                drafts.append(SegmentDraft(pageno, {"page": pageno, "block_index": bi}, "paragraph", _clip(block)))
            for ti, t in enumerate(tables):
                ttext = _rows_to_text(t.extract())
                if ttext:
                    drafts.append(SegmentDraft(pageno, {"page": pageno, "table_index": ti}, "table", _clip(ttext)))
    return drafts


def _heading_level(style_name: str) -> int | None:
    parts = style_name.split()
    if parts and parts[-1].isdigit():
        return int(parts[-1])
    return None


def parse_docx(path: Path) -> list[SegmentDraft]:
    doc = Document(str(path))
    drafts: list[SegmentDraft] = []
    for i, p in enumerate(doc.paragraphs):
        txt = p.text.strip()
        if not txt:
            continue
        style = (p.style.name if p.style else "") or ""
        if style.startswith("Heading"):
            drafts.append(SegmentDraft(None, {"para_index": i, "level": _heading_level(style)}, "heading", _clip(txt)))
        else:
            drafts.append(SegmentDraft(None, {"para_index": i}, "paragraph", _clip(txt)))
    for j, table in enumerate(doc.tables):
        rows = [[c.text for c in row.cells] for row in table.rows]
        ttext = _rows_to_text(rows)
        if ttext:
            drafts.append(SegmentDraft(None, {"table_index": j}, "table", _clip(ttext)))
    return drafts


def recognize_standard_doc(db: Session, storage: FileStorage, doc_id: int) -> RecognizeResult:
    sd = db.get(StandardDoc, doc_id)
    if sd is None:
        return RecognizeResult(
            doc_id=doc_id, doc_code="", recognition_status="failed",
            segment_count=0, page_count=None, error="文档记录不存在",
        )
    fo = db.get(FileObject, sd.file_id) if sd.file_id else None
    ext = (Path(fo.file_name).suffix.lower() if fo else "")
    status, error, drafts = "failed", None, []
    try:
        if fo is None:
            error = "源文件记录缺失，无法识别"
        else:
            path = storage.base_dir / fo.object_key
            if not path.exists():
                error = "源文件缺失，无法识别"
            elif ext == ".pdf":
                drafts = parse_pdf(path)
                if not drafts:
                    error = "未从 PDF 抽取到文本，可能是扫描件（暂不支持 OCR）"
            elif ext == ".docx":
                drafts = parse_docx(path)
                if not drafts:
                    error = "文档为空，未抽取到任何内容"
            else:
                raise UnsupportedFormatError(ext or "(无扩展名)")
    except UnsupportedFormatError as e:
        error = f"不支持的格式 {e.ext}，请转存为 .docx 或 PDF"
        drafts = []
    except Exception as e:  # noqa: BLE001
        error = f"识别失败：{str(e)[:300]}"
        drafts = []

    if drafts and error is None:
        db.execute(delete(ParseSegment).where(ParseSegment.standard_doc_id == doc_id))
        for d in drafts:
            db.add(ParseSegment(
                standard_doc_id=doc_id,
                material_file_id=None,
                page_no=d.page_no,
                locator=d.locator,
                segment_type=_SEGMENT_TYPE_MAP.get(d.segment_type, d.segment_type),
                content_text=d.content_text,
            ))
        status = "done"
        segment_count = len(drafts)
        pages = {d.page_no for d in drafts if d.page_no is not None}
        page_count = max(pages) if pages else None
    else:
        status, segment_count, page_count = "failed", 0, None
        if error is None:
            error = "识别失败：未产出任何片段"

    sd.recognition_status = status
    sd.recognition_error = error if status == "failed" else None
    db.add(sd)
    db.commit()
    return RecognizeResult(
        doc_id=doc_id, doc_code=sd.doc_code, recognition_status=status,
        segment_count=segment_count, page_count=page_count, error=error if status == "failed" else None,
    )
