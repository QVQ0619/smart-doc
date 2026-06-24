# OCR 文档识别 + 后台任务化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 smart-doc 文档识别加 OCR（扫描件/图片型 PDF/图片文件），并把识别改为后台任务，识别期间状态为 `processing`。

**Architecture:** 新增隔离模块 `app/ocr.py`（RapidOCR 引擎 + PyMuPDF 栅格化，可选 import 优雅降级）；`recognition.py` 按页回退（有文本层走 pdfplumber，空页走 OCR）并新增图片分支；上传与 `/recognize` 改用 FastAPI `BackgroundTasks` 异步执行，应用启动时把残留 `processing` 重置为 `pending`；agent shim 上传后轮询至 `done` 再返回；前端加 `processing` 状态与动态轮询间隔。

**Tech Stack:** Python 3.13 / FastAPI / SQLModel / pdfplumber / **rapidocr-onnxruntime** / **pymupdf(fitz)** ；前端 React 19 / antd 5 / @tanstack/react-query / vitest。

## Global Constraints

- OCR 依赖必须**可选**：`app/ocr.py` 用 `try/except ImportError` 暴露 `OCR_AVAILABLE: bool`；未安装时 OCR 静默关闭，docx / 文本层 PDF 流程与现有测试零影响。
- DB `segment_type` 只允许 `text | table | title | figure`；OCR 段一律落 `segment_type="text"`。
- OCR 段的 `locator` 必须带 `"ocr": True` 标记，保留 `page_no`。
- 识别状态取值：`pending | processing | done | failed`（`models.py` 的 `recognition_status` 已是字符串字段，**不需要 DB 迁移**）。
- 后端测试连 `smart_test` 库（见 `tests/conftest.py`），现有 31 条 pytest 不得退步；OCR 引擎本身的真实推理用 `skipif(not OCR_AVAILABLE)` 守护，其余测试一律 **mock** `app.ocr` 的函数，保持快速确定。
- 栅格化 DPI ≈ 250。
- 提交信息用中文，遵循现有 `feat(...)/refactor(...)` 风格。

---

## File Structure

- **Create** `backend/app/ocr.py` — OCR 引擎封装：`OCR_AVAILABLE`、`ocr_image(path)`、`ocr_pdf_page(page)`；RapidOCR 延迟单例。
- **Modify** `backend/requirements.txt` — 增加 `rapidocr-onnxruntime`、`pymupdf`。
- **Modify** `backend/app/recognition.py` — `parse_pdf` 按页回退；新增 `parse_image`、`IMAGE_EXTS`、图片分支与降级文案；新增 `reset_stuck_processing`。
- **Modify** `backend/app/routers/standard_docs.py` — upload + recognize 端点改 `BackgroundTasks`，新增 `_recognize_bg`。
- **Modify** `backend/app/main.py` — lifespan 启动时调用 `reset_stuck_processing`。
- **Modify** `backend/app/schemas.py` — `RecognizeResult.recognition_status` 注释补 `processing`（仅注释）。
- **Modify** `backend/agent_shim/smart_doc_add.py` — 新增 `wait_for_done`，上传后轮询至终态再打印。
- **Modify** `src/components/StandardDocLibrary.tsx` — `STATUS` 加 `processing`；`refetchInterval` 动态化；recognize mutation 处理 `processing`。
- **Test** `backend/tests/test_ocr.py`（新）、扩展 `backend/tests/test_recognition.py`、扩展 `backend/tests/test_standard_docs_*`（新建 `test_recognition_async.py`）、新建 `backend/tests/test_shim_add.py`、扩展 `src/components/StandardDocLibrary.test.tsx`。

---

## Task 1: 依赖 + `app/ocr.py` 引擎封装（可选 import）

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/app/ocr.py`
- Test: `backend/tests/test_ocr.py`

**Interfaces:**
- Consumes: 无（仅第三方库）
- Produces:
  - `app.ocr.OCR_AVAILABLE: bool`
  - `app.ocr.ocr_image(path: pathlib.Path) -> list[str]`（图片 → 文本行；不可用或无文字返回 `[]`）
  - `app.ocr.ocr_pdf_page(page) -> list[str]`（`fitz.Page` 渲染 250 DPI → OCR → 文本行；不可用返回 `[]`）

- [ ] **Step 1: 加依赖**

在 `backend/requirements.txt` 末尾追加两行：

```
rapidocr-onnxruntime>=1.3
pymupdf>=1.24
```

安装：

```bash
cd backend && .venv/Scripts/python.exe -m pip install rapidocr-onnxruntime pymupdf
```

- [ ] **Step 2: 写失败测试**

创建 `backend/tests/test_ocr.py`：

```python
from pathlib import Path

import app.ocr as ocr


def test_ocr_available_is_bool():
    assert isinstance(ocr.OCR_AVAILABLE, bool)


def test_ocr_image_returns_list_and_degrades(monkeypatch):
    # OCR 不可用时必须返回 []，绝不抛异常
    monkeypatch.setattr(ocr, "OCR_AVAILABLE", False)
    assert ocr.ocr_image(Path("nonexistent.png")) == []


def test_ocr_pdf_page_degrades(monkeypatch):
    monkeypatch.setattr(ocr, "OCR_AVAILABLE", False)
    assert ocr.ocr_pdf_page(object()) == []
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_ocr.py -v`
Expected: FAIL —— `ModuleNotFoundError: No module named 'app.ocr'`

- [ ] **Step 4: 写实现**

创建 `backend/app/ocr.py`：

```python
"""OCR 引擎封装（RapidOCR + PyMuPDF 栅格化）。

可选依赖：未安装时 OCR_AVAILABLE=False，所有函数返回 []，绝不抛异常。
"""
from __future__ import annotations

from pathlib import Path

try:
    import fitz  # PyMuPDF
    from rapidocr_onnxruntime import RapidOCR

    OCR_AVAILABLE = True
except ImportError:  # pragma: no cover - 取决于部署环境是否装了 OCR 组件
    OCR_AVAILABLE = False

_RENDER_DPI = 250
_engine = None  # RapidOCR 延迟单例


def _get_engine():
    global _engine
    if _engine is None:
        _engine = RapidOCR()
    return _engine


def _run(image_or_path) -> list[str]:
    """RapidOCR 返回 (result, elapse)，result 为 [[box, text, score], ...] 或 None。"""
    result, _ = _get_engine()(image_or_path)
    if not result:
        return []
    return [str(item[1]).strip() for item in result if str(item[1]).strip()]


def ocr_image(path: Path) -> list[str]:
    if not OCR_AVAILABLE:
        return []
    try:
        return _run(str(path))
    except Exception:  # noqa: BLE001 - OCR 失败降级为空，由上层落 failed
        return []


def ocr_pdf_page(page) -> list[str]:
    """page 为 fitz.Page；按 _RENDER_DPI 栅格化为 PNG 字节后送 OCR。"""
    if not OCR_AVAILABLE:
        return []
    try:
        pix = page.get_pixmap(dpi=_RENDER_DPI)
        import numpy as np

        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 4:  # RGBA -> RGB
            img = img[:, :, :3]
        return _run(img)
    except Exception:  # noqa: BLE001
        return []
```

> 说明：`numpy` 由 rapidocr-onnxruntime 间接安装，可直接 import。

- [ ] **Step 5: 运行测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_ocr.py -v`
Expected: PASS（3 passed）

- [ ] **Step 6: 提交**

```bash
git add backend/requirements.txt backend/app/ocr.py backend/tests/test_ocr.py
git commit -m "feat(backend): 新增 app/ocr.py OCR 引擎封装(RapidOCR+PyMuPDF,可选依赖)"
```

---

## Task 2: `recognition.py` —— 图片分支 + PDF 按页回退 + 降级文案

**Files:**
- Modify: `backend/app/recognition.py`
- Test: `backend/tests/test_recognition.py`

**Interfaces:**
- Consumes: `app.ocr.OCR_AVAILABLE`、`app.ocr.ocr_image`、`app.ocr.ocr_pdf_page`（Task 1）
- Produces:
  - `recognition.IMAGE_EXTS: set[str]`
  - `recognition.parse_image(path: Path) -> list[SegmentDraft]`
  - `parse_pdf` 行为变更：空文本页在 OCR 可用时回退 OCR
  - `recognize_standard_doc` 新增图片扩展名分支与按 OCR 可用性区分的降级文案

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_recognition.py` 末尾追加（文件顶部已 import Path/Session/engine/FileStorage/recognize_standard_doc/_seed_doc/_count_segments）：

```python
import app.ocr as ocrmod  # noqa: E402


def _make_mixed_pdf(path: Path) -> None:
    """第1页有文本层(latin，pdfplumber 可抽)，第2页空白(模拟扫描页)。"""
    import fitz
    doc = fitz.open()
    p1 = doc.new_page()
    p1.insert_text((72, 72), "hello world")
    doc.new_page()  # 空白第2页
    doc.save(str(path))
    doc.close()


def test_parse_pdf_empty_page_falls_back_to_ocr(tmp_path, storage_dir, _test_db, monkeypatch):
    storage = FileStorage(storage_dir)
    src = tmp_path / "mixed.pdf"
    _make_mixed_pdf(src)
    doc_id = _seed_doc(storage, src, "mixed.pdf")
    monkeypatch.setattr(ocrmod, "OCR_AVAILABLE", True)
    monkeypatch.setattr(ocrmod, "ocr_pdf_page", lambda page: ["扫描出的文字"])
    with Session(engine) as db:
        res = recognize_standard_doc(db, storage, doc_id)
    assert res.recognition_status == "done"
    with Session(engine) as s:
        from sqlalchemy import text as sqltext
        rows = s.execute(sqltext(
            "SELECT content_text, page_no FROM parse_segment WHERE standard_doc_id=:d ORDER BY id"
        ), {"d": doc_id}).all()
    texts = [r[0] for r in rows]
    assert any("hello world" in t for t in texts)        # 文本页走 pdfplumber
    assert any("扫描出的文字" in t for t in texts)         # 空白页走 OCR
    assert any(r[1] == 2 for r in rows)                  # OCR 段 page_no=2


def test_recognize_image_file_via_ocr(tmp_path, storage_dir, _test_db, monkeypatch):
    storage = FileStorage(storage_dir)
    src = tmp_path / "scan.png"
    src.write_bytes(b"\x89PNG\r\n\x1a\n fake")  # 内容无所谓，ocr_image 被 mock
    doc_id = _seed_doc(storage, src, "scan.png")
    monkeypatch.setattr(ocrmod, "OCR_AVAILABLE", True)
    monkeypatch.setattr(ocrmod, "ocr_image", lambda path: ["图片里的中文"])
    with Session(engine) as db:
        res = recognize_standard_doc(db, storage, doc_id)
    assert res.recognition_status == "done"
    assert res.segment_count == 1
    with Session(engine) as s:
        from sqlalchemy import text as sqltext
        row = s.execute(sqltext(
            "SELECT content_text, segment_type, locator FROM parse_segment WHERE standard_doc_id=:d"
        ), {"d": doc_id}).first()
    assert "图片里的中文" in row[0]
    assert row[1] == "text"            # OCR 段落落 text


def test_recognize_image_without_ocr_degrades(tmp_path, storage_dir, _test_db, monkeypatch):
    storage = FileStorage(storage_dir)
    src = tmp_path / "scan.jpg"
    src.write_bytes(b"\xff\xd8\xff fake")
    doc_id = _seed_doc(storage, src, "scan.jpg")
    monkeypatch.setattr(ocrmod, "OCR_AVAILABLE", False)
    with Session(engine) as db:
        res = recognize_standard_doc(db, storage, doc_id)
    assert res.recognition_status == "failed"
    assert "OCR" in (res.error or "")
    assert _count_segments(doc_id) == 0
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_recognition.py -v`
Expected: FAIL —— 图片扩展名走 `UnsupportedFormatError`、空白页不回退 OCR

- [ ] **Step 3: 写实现**

编辑 `backend/app/recognition.py`：

(a) 顶部 import 区，把 `from .schemas import RecognizeResult` 之后加入 OCR 模块引用，并新增图片扩展名常量：

```python
from . import ocr  # OCR 可选模块；通过模块属性访问以便测试 monkeypatch
```

在 `_SEGMENT_TYPE_MAP` 一行下方新增：

```python
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}
```

(b) 用下面整体替换现有 `parse_pdf`（加入空页 OCR 回退）：

```python
def parse_pdf(path: Path) -> list[SegmentDraft]:
    drafts: list[SegmentDraft] = []
    fdoc = None
    if ocr.OCR_AVAILABLE:
        import fitz
        fdoc = fitz.open(str(path))
    try:
        with pdfplumber.open(str(path)) as pdf:
            for pageno, page in enumerate(pdf.pages, start=1):
                tables = page.find_tables()
                text_region = page
                for t in tables:
                    text_region = text_region.outside_bbox(t.bbox)
                text = text_region.extract_text() or ""
                blocks = [b.strip() for b in re.split(r"\n\s*\n", text) if b.strip()]
                if not blocks and not tables and fdoc is not None:
                    # 该页无文本层，疑似扫描页 -> OCR 回退
                    lines = ocr.ocr_pdf_page(fdoc[pageno - 1])
                    ocr_text = "\n".join(lines).strip()
                    if ocr_text:
                        drafts.append(SegmentDraft(
                            pageno, {"page": pageno, "block_index": 0, "ocr": True},
                            "paragraph", _clip(ocr_text)))
                    continue
                for bi, block in enumerate(blocks):
                    drafts.append(SegmentDraft(pageno, {"page": pageno, "block_index": bi}, "paragraph", _clip(block)))
                for ti, t in enumerate(tables):
                    ttext = _rows_to_text(t.extract())
                    if ttext:
                        drafts.append(SegmentDraft(pageno, {"page": pageno, "table_index": ti}, "table", _clip(ttext)))
    finally:
        if fdoc is not None:
            fdoc.close()
    return drafts
```

(c) 在 `parse_docx` 之后新增图片解析函数：

```python
def parse_image(path: Path) -> list[SegmentDraft]:
    if not ocr.OCR_AVAILABLE:
        return []
    lines = ocr.ocr_image(path)
    text = "\n".join(lines).strip()
    if not text:
        return []
    return [SegmentDraft(1, {"page": 1, "block_index": 0, "ocr": True}, "paragraph", _clip(text))]
```

(d) 在 `recognize_standard_doc` 的格式分支里，把 `elif ext == ".pdf":` 块的空结果文案改为按 OCR 可用性区分，并在 `.docx` 分支后、`else` 之前新增图片分支：

```python
            elif ext == ".pdf":
                drafts = parse_pdf(path)
                if not drafts:
                    if ocr.OCR_AVAILABLE:
                        error = "未从 PDF 抽取到文本，可能是扫描件且 OCR 未识别出文字"
                    else:
                        error = "未从 PDF 抽取到文本，疑似扫描件；未安装 OCR 组件，请 pip install rapidocr-onnxruntime pymupdf 后重试"
            elif ext == ".docx":
                drafts = parse_docx(path)
                if not drafts:
                    error = "文档为空，未抽取到任何内容"
            elif ext in IMAGE_EXTS:
                drafts = parse_image(path)
                if not drafts:
                    if ocr.OCR_AVAILABLE:
                        error = "未从图片中识别到文字"
                    else:
                        error = "检测到图片文件，但未安装 OCR 组件，请 pip install rapidocr-onnxruntime pymupdf 后重试"
            else:
                raise UnsupportedFormatError(ext or "(无扩展名)")
```

> 注意：保留两处 PDF 文案里的「扫描件」子串，确保现有 `test_recognize_pdf_no_text_fails_with_scanned_hint` 仍通过。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_recognition.py -v`
Expected: PASS（原有 5 条 + 新增 3 条全绿）

- [ ] **Step 5: 提交**

```bash
git add backend/app/recognition.py backend/tests/test_recognition.py
git commit -m "feat(backend): recognition 支持图片OCR与PDF按页回退OCR+降级文案"
```

---

## Task 3: 上传 + `/recognize` 端点改后台任务（processing 状态）

**Files:**
- Modify: `backend/app/routers/standard_docs.py`
- Modify: `backend/app/schemas.py`（仅注释）
- Test: `backend/tests/test_recognition_async.py`（新）

**Interfaces:**
- Consumes: `recognize_standard_doc`（现有）、`app.db.engine`
- Produces: `standard_docs._recognize_bg(doc_id: int, storage: FileStorage) -> None`；upload 与 recognize 立即返回 `recognition_status="processing"`，后台跑完置 `done/failed`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_recognition_async.py`：

```python
from io import BytesIO

from docx import Document


def _docx_bytes() -> bytes:
    d = Document()
    d.add_heading("第一章", level=1)
    d.add_paragraph("正文一段。")
    buf = BytesIO()
    d.save(buf)
    return buf.getvalue()


def test_upload_returns_processing_then_done(client):
    files = {"files": ("a.docx", _docx_bytes(),
                       "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    r = client.post("/api/standard-docs", files=files)
    assert r.status_code == 200
    up = r.json()["uploaded"][0]
    assert up["recognition_status"] == "processing"   # 立即返回 processing
    # TestClient 会在响应返回前跑完 BackgroundTasks，故列表此时已 done
    g = client.get("/api/standard-docs")
    doc = next(d for d in g.json() if d["doc_code"] == up["doc_code"])
    assert doc["recognition_status"] == "done"


def test_recognize_endpoint_returns_processing_then_done(client):
    files = {"files": ("b.docx", _docx_bytes(),
                       "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    up = client.post("/api/standard-docs", files=files).json()["uploaded"][0]
    doc_id = up["id"]
    r = client.post(f"/api/standard-docs/{doc_id}/recognize")
    assert r.status_code == 200
    assert r.json()["recognition_status"] == "processing"
    g = client.get("/api/standard-docs")
    doc = next(d for d in g.json() if d["id"] == doc_id)
    assert doc["recognition_status"] == "done"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_recognition_async.py -v`
Expected: FAIL —— upload 立即返回的是 `done`（当前同步识别），非 `processing`

- [ ] **Step 3: 写实现**

编辑 `backend/app/routers/standard_docs.py`：

(a) 顶部 import：把 `from fastapi import APIRouter, Depends, File, HTTPException, UploadFile` 改为含 `BackgroundTasks`，并引入 engine 与 Session：

```python
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
```

在 `from ..db import get_session` 改为：

```python
from ..db import engine, get_session
```

(b) 在 `_to_out` 函数上方新增后台识别函数：

```python
def _recognize_bg(doc_id: int, storage: FileStorage) -> None:
    """后台任务：用独立 Session 跑识别（请求 Session 已随响应关闭）。"""
    with Session(engine) as db:
        recognize_standard_doc(db, storage, doc_id)
```

(c) `upload_standard_docs` 签名加入 `background: BackgroundTasks`（放在 `files` 之后）：

```python
def upload_standard_docs(
    files: list[UploadFile] = File(...),
    force: bool = False,
    replace: bool = False,
    background: BackgroundTasks = None,  # FastAPI 自动注入
    db: Session = Depends(get_session),
    storage: FileStorage = Depends(get_storage),
    max_bytes: int = Depends(get_max_upload_bytes),
) -> UploadResult:
```

(d) 把原来内联识别那段（`rec = None` 到 `uploaded.append(...)`）整体替换为：

```python
        sd.recognition_status = "processing"
        db.add(sd)
        db.commit()
        db.refresh(sd)
        background.add_task(_recognize_bg, sd.id, storage)
        uploaded.append(_to_out(sd, fo, segment_count=None, page_count=None, status="created"))
```

(e) `recognize_endpoint` 整体替换为异步版：

```python
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
```

(f) 编辑 `backend/app/schemas.py`，把 `RecognizeResult.recognition_status` 行注释更新：

```python
    recognition_status: str          # processing | done | failed
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_recognition_async.py -v`
Expected: PASS（2 passed）

- [ ] **Step 5: 跑回归确认不破坏现有上传/识别测试**

Run: `cd backend && .venv/Scripts/python.exe -m pytest -q`
Expected: 全绿（原 31 + 本期新增）

- [ ] **Step 6: 提交**

```bash
git add backend/app/routers/standard_docs.py backend/app/schemas.py backend/tests/test_recognition_async.py
git commit -m "feat(backend): 上传/识别改 BackgroundTasks,立即返回 processing 状态"
```

---

## Task 4: 启动重置残留 `processing`

**Files:**
- Modify: `backend/app/recognition.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_recognition.py`

**Interfaces:**
- Consumes: `StandardDoc`、`app.db` Session
- Produces: `recognition.reset_stuck_processing(db: Session) -> int`（把所有 `processing` 重置为 `pending`，返回条数）

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_recognition.py` 末尾追加：

```python
def test_reset_stuck_processing(tmp_path, storage_dir, _test_db):
    from app.recognition import reset_stuck_processing
    storage = FileStorage(storage_dir)
    src = tmp_path / "r.docx"
    from docx import Document
    d = Document(); d.add_paragraph("x"); d.save(str(src))
    doc_id = _seed_doc(storage, src, "r.docx")
    with Session(engine) as s:
        sd = s.get(StandardDoc, doc_id)
        sd.recognition_status = "processing"
        s.add(sd); s.commit()
    with Session(engine) as s:
        n = reset_stuck_processing(s)
    assert n == 1
    with Session(engine) as s:
        assert s.get(StandardDoc, doc_id).recognition_status == "pending"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_recognition.py::test_reset_stuck_processing -v`
Expected: FAIL —— `ImportError: cannot import name 'reset_stuck_processing'`

- [ ] **Step 3: 写实现**

(a) `backend/app/recognition.py` 顶部把 `from sqlalchemy import delete` 改为：

```python
from sqlalchemy import delete, select
```

文件末尾新增：

```python
def reset_stuck_processing(db: Session) -> int:
    """应用启动时把残留 processing(进程内后台任务因重启中断) 重置为 pending。"""
    rows = db.execute(select(StandardDoc).where(StandardDoc.recognition_status == "processing")).scalars().all()
    for sd in rows:
        sd.recognition_status = "pending"
        db.add(sd)
    db.commit()
    return len(rows)
```

(b) 编辑 `backend/app/main.py`，import 与 lifespan：

把 `from .dimensions import ensure_dimensions` 下一行加：

```python
from .recognition import reset_stuck_processing
```

把 lifespan 体改为：

```python
    async def lifespan(app: FastAPI):
        with Session(engine) as db:
            ensure_dimensions(db)
            reset_stuck_processing(db)
        yield
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_recognition.py::test_reset_stuck_processing -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/recognition.py backend/app/main.py backend/tests/test_recognition.py
git commit -m "feat(backend): 启动时重置残留 processing 为 pending"
```

---

## Task 5: agent shim 上传后轮询至 done

**Files:**
- Modify: `backend/agent_shim/smart_doc_add.py`
- Test: `backend/tests/test_shim_add.py`（新）

**Interfaces:**
- Consumes: 无（纯标准库）
- Produces: `smart_doc_add.wait_for_done(list_fn, doc_code, timeout=120, interval=2.0, sleep_fn=time.sleep, clock=time.monotonic) -> str | None`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_shim_add.py`：

```python
import importlib.util
import pathlib

_p = pathlib.Path(__file__).resolve().parents[1] / "agent_shim" / "smart_doc_add.py"
_spec = importlib.util.spec_from_file_location("smart_doc_add", _p)
mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mod)


def test_wait_for_done_returns_done_after_processing():
    seq = [
        [{"doc_code": "X", "recognition_status": "processing"}],
        [{"doc_code": "X", "recognition_status": "processing"}],
        [{"doc_code": "X", "recognition_status": "done"}],
    ]
    calls = {"i": 0}

    def list_fn():
        i = min(calls["i"], len(seq) - 1)
        calls["i"] += 1
        return seq[i]

    status = mod.wait_for_done(list_fn, "X", timeout=100, interval=0,
                               sleep_fn=lambda s: None, clock=lambda: 0)
    assert status == "done"


def test_wait_for_done_times_out_returns_last():
    def list_fn():
        return [{"doc_code": "X", "recognition_status": "processing"}]

    ticks = iter([0, 0, 999])  # 第三次取时间已超 deadline

    status = mod.wait_for_done(list_fn, "X", timeout=10, interval=0,
                               sleep_fn=lambda s: None, clock=lambda: next(ticks))
    assert status == "processing"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_shim_add.py -v`
Expected: FAIL —— `AttributeError: module 'smart_doc_add' has no attribute 'wait_for_done'`

- [ ] **Step 3: 写实现**

编辑 `backend/agent_shim/smart_doc_add.py`：

(a) 顶部 import 区加 `import time`（在 `import sys` 附近）。

(b) 在 `upload(...)` 函数之后新增轮询与列表辅助：

```python
def _list_docs(api_base: str, timeout: int) -> list[dict]:
    url = api_base.rstrip("/") + "/api/standard-docs"
    headers = {}
    api_key = os.environ.get("SMART_DOC_API_KEY")
    if api_key:
        headers["X-API-Key"] = api_key
    req = urllib.request.Request(url, method="GET", headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def wait_for_done(list_fn, doc_code, timeout=120, interval=2.0,
                  sleep_fn=time.sleep, clock=time.monotonic):
    """轮询 list_fn() 直到目标 doc 的 recognition_status 离开 pending/processing，或超时。

    返回最终状态字符串(done/failed)；未找到或超时返回最后一次观察到的状态(可能为 None/processing)。
    """
    deadline = clock() + timeout
    last = None
    while True:
        for d in list_fn():
            if d.get("doc_code") == doc_code:
                last = d.get("recognition_status")
                break
        if last not in ("pending", "processing", None):
            return last
        if clock() >= deadline:
            return last
        sleep_fn(interval)
```

(c) 在 `main(...)` 里，把打印 uploaded 的循环改为上传后轮询终态再打印识别行：

把现有：

```python
        if "recognition_status" in doc:
            sys.stdout.write(
                f"recognition={doc.get('recognition_status')} segments={doc.get('segment_count')}\n"
            )
```

替换为：

```python
        if "recognition_status" in doc:
            final = wait_for_done(
                lambda: _list_docs(api_base, timeout), doc.get("doc_code"), timeout=timeout
            )
            sys.stdout.write(f"recognition={final}\n")
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_shim_add.py -v`
Expected: PASS（2 passed）

- [ ] **Step 5: 提交**

```bash
git add backend/agent_shim/smart_doc_add.py backend/tests/test_shim_add.py
git commit -m "feat(shim): smart-doc-add 上传后轮询识别至终态再返回"
```

---

## Task 6: 前端 processing 状态 + 动态轮询 + recognize 提示

**Files:**
- Modify: `src/components/StandardDocLibrary.tsx`
- Test: `src/components/StandardDocLibrary.test.tsx`

**Interfaces:**
- Consumes: `StandardDoc.recognition_status`（已含 processing）
- Produces: UI 渲染「识别中」徽标；列表含 processing 行时轮询间隔 3s 否则 10s；recognize 返回 processing 时提示「识别中…」

- [ ] **Step 1: 写失败测试**

在 `src/components/StandardDocLibrary.test.tsx` 末尾追加：

```tsx
test("processing 状态显示识别中徽标", async () => {
  vi.mocked(api.listStandardDocs).mockResolvedValue([
    { ...sample, recognition_status: "processing" },
  ] as never);
  renderLib();
  expect(await screen.findByText("识别中")).toBeInTheDocument();
});

test("有 processing 行时轮询间隔收紧到 3 秒", async () => {
  vi.useFakeTimers();
  try {
    vi.clearAllMocks();
    vi.mocked(api.listStandardDocs).mockResolvedValue([
      { ...sample, recognition_status: "processing" },
    ] as never);
    renderLib();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(api.listStandardDocs)).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);            // 3s 即触发下一次
    expect(vi.mocked(api.listStandardDocs)).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- StandardDocLibrary`
Expected: FAIL —— 无「识别中」文本；processing 时仍按 10s 轮询

- [ ] **Step 3: 写实现**

编辑 `src/components/StandardDocLibrary.tsx`：

(a) `listQuery` 的 `refetchInterval` 改为动态函数：

```tsx
  const listQuery = useQuery({
    queryKey: KEY,
    queryFn: listStandardDocs,
    refetchInterval: (query) => {
      const data = query.state.data as StandardDoc[] | undefined;
      return Array.isArray(data) && data.some((d) => d.recognition_status === "processing")
        ? 3000
        : 10000;
    },
  });
```

(b) `STATUS` map 增加 processing：

```tsx
  const STATUS: Record<string, { color: string; text: string }> = {
    pending: { color: "default", text: "待识别" },
    processing: { color: "blue", text: "识别中" },
    done: { color: "green", text: "已识别" },
    failed: { color: "red", text: "识别失败" },
  };
```

(c) `recognizeMut.onSuccess` 处理 processing：

```tsx
  const recognizeMut = useMutation({
    mutationFn: (id: number) => recognizeStandardDoc(id),
    onSuccess: (res) => {
      if (res.recognition_status === "processing") toast.info("识别中…");
      else if (res.recognition_status === "done") toast.success(`已识别 ${res.segment_count} 段`);
      else toast.warning("识别失败：" + (res.error ?? "未知原因"));
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- StandardDocLibrary`
Expected: PASS（含原有用例 + 新增 2 条）

- [ ] **Step 5: 前端构建确认零类型错误**

Run: `npm run build`
Expected: 构建成功，无 TS 报错

- [ ] **Step 6: 提交**

```bash
git add src/components/StandardDocLibrary.tsx src/components/StandardDocLibrary.test.tsx
git commit -m "feat(web): 文档识别加 processing 识别中状态与动态轮询"
```

---

## Final Verification

- [ ] 后端全量测试：`cd backend && .venv/Scripts/python.exe -m pytest -q` 全绿
- [ ] 前端全量测试：`npm run test` 全绿
- [ ] 前端构建：`npm run build` 零错误
- [ ] 端到端人工验证（可选，需真实 OCR 模型）：上传一张带中文的扫描图/扫描 PDF → 列表显示「识别中」→ 数秒后变「已识别」→ 展开能看到 OCR 段落（`locator.ocr=true`）

---

## 计划自审记录

- **Spec 覆盖**：①RapidOCR+PyMuPDF 引擎→T1；②按页回退→T2;③图片格式→T2;④可选降级→T1(函数)+T2(文案);⑤processing 状态机+后台任务→T3;⑥startup 重置→T4;⑦shim 轮询→T5;⑧前端 processing+轮询→T6;⑨测试策略(mock/skipif/fitz fixture)→各任务 Step1。全部有对应任务。
- **占位符**：无 TBD/TODO，每个代码步均给完整代码。
- **类型一致**：`OCR_AVAILABLE/ocr_image/ocr_pdf_page`(T1)→T2 一致引用；`_recognize_bg(doc_id, storage)`(T3) 签名前后一致；`reset_stuck_processing(db)->int`(T4) 与 main.py 调用一致；`wait_for_done(list_fn,doc_code,...)`(T5) 与测试签名一致。
