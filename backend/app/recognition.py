from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import pdfplumber
from docx import Document

MAX_SEGMENT_CHARS = 65536


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
