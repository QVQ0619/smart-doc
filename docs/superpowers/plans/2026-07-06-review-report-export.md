# 审查报告一键导出（Word + PDF）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在审查结果页一键导出当前申报包的审查报告，同时生成 Word + PDF 打包为 zip 下载。

**Architecture:** 后端自包含子包 `backend/app/reporting/`（`ReportModel` 纯数据契约 + 两个审查类型无关的渲染器 + zip 打包），一个耦合本项目的 `report_builder.py` 把 `ApplicationPackage` 翻译成 `ReportModel`，一个读端点 `GET /packages/{id}/report/export` 返回 zip。前端结论横幅右上加「导出报告」按钮，走 fetch-blob 下载。

**Tech Stack:** FastAPI + SQLModel（后端）；`python-docx`（已装，Word）+ `reportlab`（新增，PDF，内置 CJK 字体 STSong-Light）；React + antd + @tanstack/react-query + vitest（前端）。

## Global Constraints

- **纯 Python、零系统依赖**：PDF 用 `reportlab`（不引入 weasyprint/LibreOffice）。
- **PDF 中文**：用 reportlab 内置 CID 字体 `STSong-Light`，不附带字体文件。
- **零 LLM**：报告生成是确定性渲染，不调用任何模型。
- **渲染器审查类型无关**：`reporting/` 包只依赖 `ReportModel` + docx/reportlab，禁止 import 本项目的 models/db。
- **改判判据**：审计留痕块**仅当 `check.status == "overruled"`** 时渲染；`confirm`（status="confirmed"）沿用初判，不算改判、不渲染留痕。
- **读端点约定**：导出是读操作，端点**不加** `X-API-Key`（沿用现有读端点约定）。
- **缺失字段**：封面缺项填 `"—"`；发现无出处填 `"无"`。
- **文件编码**：新建 `.py`/`.ts`/`.md` 一律 UTF-8 无 BOM。
- **测试命令**：后端 `cd backend && python -m pytest`；前端 `npx vitest run`。
- **禁用** `git add -A`：每步只 `git add` 本步涉及文件。

---

## 文件结构

```
backend/app/reporting/
├─ __init__.py           ← 导出 ReportModel 等契约 + render_docx/render_pdf/package_zip
├─ model.py              ← ReportModel + 子 dataclass（纯数据，零外部依赖）
├─ styles.py             ← 维度顺序/标签、结果标签/配色、结论标签、统计分桶
├─ render_docx.py        ← render_docx(model) -> bytes（python-docx）
├─ render_pdf.py         ← render_pdf(model) -> bytes（reportlab）
├─ package.py            ← package_zip(files: dict[str, bytes]) -> bytes
└─ README.md             ← ReportModel 契约 + 复用步骤
backend/app/report_builder.py   ← assemble_report_model(纯) + build_report_model(db, id)
backend/app/routers/review.py   ← 新增 GET /packages/{id}/report/export（修改）
backend/requirements.txt        ← 增 reportlab（修改）
backend/tests/test_report_render.py     ← 渲染器 + zip 单测（DB-free）
backend/tests/test_report_builder.py    ← assemble_report_model 单测（DB-free）
backend/tests/test_report_export_api.py ← 端点集成测试（seed DB）
src/api/review.ts               ← 新增 exportPackageReport（修改）
src/api/review.export.test.ts   ← exportPackageReport 单测
src/components/review/ReviewWorkbench.tsx        ← 加按钮（修改）
src/components/review/ReviewWorkbench.export.test.tsx ← 按钮组件测试
```

---

## Task 1：reporting 包骨架 —— ReportModel 契约 + styles 常量

**Files:**
- Create: `backend/app/reporting/__init__.py`（本任务先留空文件）
- Create: `backend/app/reporting/model.py`
- Create: `backend/app/reporting/styles.py`
- Test: `backend/tests/test_report_render.py`（本任务先建，只测 model/styles）

**Interfaces:**
- Produces:
  - `model.EvidenceRef(quote: str, locator: str)`
  - `model.AuditTrail(initial: str, final: str, disposition: str)`
  - `model.Finding(result_label: str, result_key: str, rule_code: str, name: str, severity: Optional[int], confidence: Optional[float], suggestion: str, evidence: list[EvidenceRef], audit: Optional[AuditTrail])`
  - `model.Section(dimension_label: str, findings: list[Finding])`
  - `model.DimensionStat(dimension_label: str, passed: int, failed: int, attention: int)`
  - `model.ReportModel(title: str, cover: list[tuple[str, str]], conclusion_text: str, dimension_stats: list[DimensionStat], sections: list[Section], footer_note: str)`
  - `styles.DIMENSION_ORDER: list[str]`、`styles.DIMENSION_LABELS: dict[str, str]`、`styles.RESULT_LABELS: dict[str, str]`、`styles.RESULT_COLORS: dict[str, str]`、`styles.CONCLUSION_LABELS: dict[str, str]`
  - `styles.result_bucket(result_key: str) -> str`（返回 `"passed"|"failed"|"attention"`）

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_report_render.py`：

```python
from app.reporting import model, styles


def test_report_model_constructs_and_holds_fields():
    ev = model.EvidenceRef(quote="申请人:张三", locator="申请书/第1页")
    audit = model.AuditTrail(initial="通过", final="不通过", disposition="预算表缺失")
    f = model.Finding(result_label="不通过", result_key="fail", rule_code="R-1",
                      name="必须有预算表", severity=3, confidence=0.9,
                      suggestion="应补充预算表", evidence=[ev], audit=audit)
    sec = model.Section(dimension_label="完整性", findings=[f])
    stat = model.DimensionStat(dimension_label="完整性", passed=1, failed=1, attention=0)
    rm = model.ReportModel(title="立项审查报告", cover=[("项目名称", "X")],
                           conclusion_text="综合结论：需整改", dimension_stats=[stat],
                           sections=[sec], footer_note="系统生成")
    assert rm.title == "立项审查报告"
    assert rm.sections[0].findings[0].audit.final == "不通过"
    assert rm.cover[0] == ("项目名称", "X")


def test_styles_dimension_order_and_labels_match_backend():
    assert styles.DIMENSION_ORDER == ["completeness", "normativeness", "compliance",
                                      "consistency", "rationality", "authenticity"]
    assert styles.DIMENSION_LABELS["completeness"] == "完整性"
    assert styles.RESULT_LABELS["fail"] == "不通过"
    assert styles.CONCLUSION_LABELS["fix"] == "需整改"


def test_result_bucket_three_way():
    assert styles.result_bucket("pass") == "passed"
    assert styles.result_bucket("fail") == "failed"
    assert styles.result_bucket("need_review") == "attention"
    assert styles.result_bucket("not_applicable") == "attention"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && python -m pytest tests/test_report_render.py -v`
Expected: FAIL（`ModuleNotFoundError: app.reporting`）

- [ ] **Step 3: 实现 model.py 与 styles.py**

创建 `backend/app/reporting/__init__.py`（空文件，本任务留空，Task 6 再补导出）。

创建 `backend/app/reporting/model.py`：

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class EvidenceRef:
    quote: str
    locator: str


@dataclass
class AuditTrail:
    initial: str      # 机审初判结果文字
    final: str        # 人工改判后结果文字
    disposition: str  # 处置说明


@dataclass
class Finding:
    result_label: str
    result_key: str
    rule_code: str
    name: str
    severity: Optional[int]
    confidence: Optional[float]
    suggestion: str
    evidence: list[EvidenceRef]
    audit: Optional[AuditTrail]


@dataclass
class Section:
    dimension_label: str
    findings: list[Finding]


@dataclass
class DimensionStat:
    dimension_label: str
    passed: int
    failed: int
    attention: int


@dataclass
class ReportModel:
    title: str
    cover: list[tuple[str, str]]   # 有序键值对
    conclusion_text: str
    dimension_stats: list[DimensionStat]
    sections: list[Section]
    footer_note: str
```

创建 `backend/app/reporting/styles.py`：

```python
from __future__ import annotations

# 六维度顺序与标签（与 backend/app/dimensions.py、前端 review-constants 保持一致）
DIMENSION_ORDER: list[str] = [
    "completeness", "normativeness", "compliance",
    "consistency", "rationality", "authenticity",
]
DIMENSION_LABELS: dict[str, str] = {
    "completeness": "完整性", "normativeness": "规范性", "compliance": "合规性",
    "consistency": "一致性", "rationality": "合理性", "authenticity": "真实性",
}

# 结果 code → 中文标签（与前端 review-constants RESULT 一致）
RESULT_LABELS: dict[str, str] = {
    "pass": "通过", "fail": "不通过", "need_review": "待复核",
    "not_applicable": "不适用", "pending": "待判", "error": "错误",
}

# 结果 code → 语义色 hex（Word/PDF 共用；与前端配色语义一致）
RESULT_COLORS: dict[str, str] = {
    "pass": "#52c41a", "fail": "#ff4d4f", "need_review": "#fa8c16",
    "not_applicable": "#8c8c8c", "pending": "#8c8c8c", "error": "#ff4d4f",
}

# 结论 code → 中文标签（与前端 review-constants CONCLUSION 一致）
CONCLUSION_LABELS: dict[str, str] = {
    "reject": "建议不予立项", "fix": "需整改", "accept": "通过", "pending": "待定",
}


def dimension_label(code: str) -> str:
    return DIMENSION_LABELS.get(code, code)


def result_label(key: str) -> str:
    return RESULT_LABELS.get(key, key)


def result_color(key: str) -> str:
    return RESULT_COLORS.get(key, "#000000")


def result_bucket(result_key: str) -> str:
    """把结果归到统计三桶：通过 / 不通过 / 需关注。"""
    if result_key == "pass":
        return "passed"
    if result_key == "fail":
        return "failed"
    return "attention"
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && python -m pytest tests/test_report_render.py -v`
Expected: PASS（3 项）

- [ ] **Step 5: 提交**

```bash
git add backend/app/reporting/__init__.py backend/app/reporting/model.py backend/app/reporting/styles.py backend/tests/test_report_render.py
git commit -m "feat(report): reporting 包骨架 ReportModel 契约 + styles 常量"
```

---

## Task 2：Word 渲染器 render_docx

**Files:**
- Create: `backend/app/reporting/render_docx.py`
- Test: `backend/tests/test_report_render.py`（追加）

**Interfaces:**
- Consumes: `model.ReportModel`（Task 1）
- Produces: `render_docx.render_docx(m: ReportModel) -> bytes`（返回 .docx 二进制）

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_report_render.py` 顶部补充导入并追加测试。顶部 import 改为：

```python
import io
from docx import Document
from app.reporting import model, styles
from app.reporting.render_docx import render_docx
```

追加一个共享的样例模型工厂 + 测试：

```python
def _sample_model():
    ev = model.EvidenceRef(quote="申请人:张三", locator="申请书/第1页")
    audit = model.AuditTrail(initial="通过", final="不通过", disposition="预算表缺失")
    f_over = model.Finding(result_label="不通过", result_key="fail", rule_code="R-012",
                           name="必须有预算表", severity=3, confidence=0.92,
                           suggestion="未提供预算明细表，应补充。", evidence=[ev], audit=audit)
    f_plain = model.Finding(result_label="通过", result_key="pass", rule_code="R-003",
                            name="项目名称完整", severity=None, confidence=None,
                            suggestion="", evidence=[], audit=None)
    sec = model.Section(dimension_label="完整性", findings=[f_over, f_plain])
    stat = model.DimensionStat(dimension_label="完整性", passed=1, failed=1, attention=0)
    return model.ReportModel(
        title="立项审查报告",
        cover=[("项目名称", "示范科研项目"), ("申报单位", "某研究所"), ("审查结论", "需整改")],
        conclusion_text="共审查规则 2 条，通过 1、不通过 1、需关注 0。综合结论：需整改",
        dimension_stats=[stat], sections=[sec], footer_note="智能立项审查系统 生成")


def test_render_docx_returns_readable_docx_with_key_text():
    data = render_docx(_sample_model())
    assert isinstance(data, bytes) and len(data) > 0
    doc = Document(io.BytesIO(data))
    text = "\n".join(p.text for p in doc.paragraphs)
    table_text = "\n".join(c.text for t in doc.tables for row in t.rows for c in row.cells)
    whole = text + "\n" + table_text
    assert "立项审查报告" in whole          # 标题
    assert "示范科研项目" in whole          # 封面字段
    assert "综合结论：需整改" in whole       # 结论段
    assert "完整性" in whole                # 维度标题
    assert "必须有预算表" in whole          # 发现名称
    assert "未提供预算明细表" in whole       # 审查意见
    assert "申请书/第1页" in whole          # 出处定位
    assert "机审初判" in whole and "预算表缺失" in whole   # 审计留痕
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && python -m pytest tests/test_report_render.py::test_render_docx_returns_readable_docx_with_key_text -v`
Expected: FAIL（`ModuleNotFoundError: app.reporting.render_docx`）

- [ ] **Step 3: 实现 render_docx.py**

创建 `backend/app/reporting/render_docx.py`：

```python
from __future__ import annotations

import io

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor

from .model import Finding, ReportModel
from .styles import result_color


def _hex_to_rgb(h: str) -> RGBColor:
    h = h.lstrip("#")
    return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _add_finding(doc: Document, f: Finding) -> None:
    head = doc.add_paragraph()
    badge = head.add_run(f"[{f.result_label}] ")
    badge.bold = True
    badge.font.color.rgb = _hex_to_rgb(result_color(f.result_key))
    head.add_run(f"{f.rule_code} {f.name}")
    if f.severity is not None:
        head.add_run(f"    严重度：{f.severity}")
    if f.confidence is not None:
        doc.add_paragraph(f"置信度：{f.confidence:.2f}")
    doc.add_paragraph(f"审查意见：{f.suggestion or '—'}")
    doc.add_paragraph("依据出处：")
    if f.evidence:
        for e in f.evidence:
            doc.add_paragraph(f"· {e.locator}：{e.quote}", style="List Bullet")
    else:
        doc.add_paragraph("无")
    if f.audit is not None:
        doc.add_paragraph("—— 审计留痕 ——")
        doc.add_paragraph(f"机审初判：{f.audit.initial} → 人工改判：{f.audit.final}")
        doc.add_paragraph(f"处置说明：{f.audit.disposition or '—'}")


def render_docx(m: ReportModel) -> bytes:
    doc = Document()

    # ① 封面
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    tr = title.add_run(m.title)
    tr.bold = True
    tr.font.size = Pt(24)
    doc.add_paragraph()
    for label, value in m.cover:
        doc.add_paragraph(f"{label}：{value}")
    footer = doc.add_paragraph()
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    footer.add_run(m.footer_note)
    doc.add_page_break()

    # ② 结论页
    doc.add_heading("一、审查结论", level=1)
    doc.add_paragraph(m.conclusion_text)
    tbl = doc.add_table(rows=1, cols=4)
    tbl.style = "Table Grid"
    hdr = tbl.rows[0].cells
    hdr[0].text, hdr[1].text, hdr[2].text, hdr[3].text = "维度", "通过", "不通过", "需关注"
    for st in m.dimension_stats:
        row = tbl.add_row().cells
        row[0].text = st.dimension_label
        row[1].text = str(st.passed)
        row[2].text = str(st.failed)
        row[3].text = str(st.attention)

    # ③ 分维度发现
    doc.add_heading("二、分维度审查发现", level=1)
    for sec in m.sections:
        doc.add_heading(sec.dimension_label, level=2)
        for f in sec.findings:
            _add_finding(doc, f)

    # ④ 结尾签署
    doc.add_heading("三、审查说明", level=1)
    doc.add_paragraph("本报告由智能立项审查系统依据规则库自动生成，人工复核记录见各条审计留痕。")
    doc.add_paragraph("审查人：______________        日期：______________")

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && python -m pytest tests/test_report_render.py -v`
Expected: PASS（含 Task 1 的 + 本任务的 docx 测试）

- [ ] **Step 5: 提交**

```bash
git add backend/app/reporting/render_docx.py backend/tests/test_report_render.py
git commit -m "feat(report): Word 渲染器 render_docx"
```

---

## Task 3：PDF 渲染器 render_pdf（新增 reportlab 依赖）

**Files:**
- Modify: `backend/requirements.txt`（增 `reportlab>=4.0`）
- Create: `backend/app/reporting/render_pdf.py`
- Test: `backend/tests/test_report_render.py`（追加）

**Interfaces:**
- Consumes: `model.ReportModel`（Task 1）
- Produces: `render_pdf.render_pdf(m: ReportModel) -> bytes`（返回 .pdf 二进制）

- [ ] **Step 1: 装依赖**

在 `backend/requirements.txt` 末尾追加一行：

```
reportlab>=4.0
```

Run: `cd backend && python -m pip install "reportlab>=4.0"`
Expected: 安装成功。

- [ ] **Step 2: 写失败测试**

在 `backend/tests/test_report_render.py` 追加（复用已有 `_sample_model()`）。顶部补充导入：

```python
import pdfplumber
from app.reporting.render_pdf import render_pdf
```

追加测试：

```python
def test_render_pdf_is_pdf_and_contains_chinese_text():
    data = render_pdf(_sample_model())
    assert isinstance(data, bytes) and data[:4] == b"%PDF"
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        text = "\n".join((page.extract_text() or "") for page in pdf.pages)
    assert "立项审查报告" in text      # 标题（中文未乱码）
    assert "必须有预算表" in text      # 发现名称
    assert "机审初判" in text          # 审计留痕
```

- [ ] **Step 3: 运行确认失败**

Run: `cd backend && python -m pytest tests/test_report_render.py::test_render_pdf_is_pdf_and_contains_chinese_text -v`
Expected: FAIL（`ModuleNotFoundError: app.reporting.render_pdf`）

- [ ] **Step 4: 实现 render_pdf.py**

创建 `backend/app/reporting/render_pdf.py`：

```python
from __future__ import annotations

import io

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import (PageBreak, Paragraph, SimpleDocTemplate, Spacer,
                                Table, TableStyle)

from .model import Finding, ReportModel
from .styles import result_color

_FONT = "STSong-Light"          # reportlab 内置 CJK 字体，无需附带字体文件
_FONT_REGISTERED = False


def _ensure_font() -> None:
    global _FONT_REGISTERED
    if not _FONT_REGISTERED:
        pdfmetrics.registerFont(UnicodeCIDFont(_FONT))
        _FONT_REGISTERED = True


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=base["Normal"], fontName=_FONT,
                          fontSize=10.5, leading=16)
    return {
        "title": ParagraphStyle("title", parent=body, fontSize=24, leading=32,
                                alignment=TA_CENTER, spaceAfter=24),
        "footer": ParagraphStyle("footer", parent=body, alignment=TA_RIGHT),
        "h1": ParagraphStyle("h1", parent=body, fontSize=15, leading=22,
                             spaceBefore=12, spaceAfter=8),
        "h2": ParagraphStyle("h2", parent=body, fontSize=13, leading=20,
                             spaceBefore=8, spaceAfter=6),
        "body": body,
        "bullet": ParagraphStyle("bullet", parent=body, leftIndent=12),
        "audit": ParagraphStyle("audit", parent=body, textColor=colors.HexColor("#8c8c8c")),
    }


def _finding_flowables(f: Finding, s: dict[str, ParagraphStyle]) -> list:
    out = []
    badge = f'<font color="{result_color(f.result_key)}"><b>[{f.result_label}]</b></font>'
    sev = f"    严重度：{f.severity}" if f.severity is not None else ""
    out.append(Paragraph(f"{badge} {f.rule_code} {f.name}{sev}", s["body"]))
    if f.confidence is not None:
        out.append(Paragraph(f"置信度：{f.confidence:.2f}", s["body"]))
    out.append(Paragraph(f"审查意见：{f.suggestion or '—'}", s["body"]))
    out.append(Paragraph("依据出处：", s["body"]))
    if f.evidence:
        for e in f.evidence:
            out.append(Paragraph(f"· {e.locator}：{e.quote}", s["bullet"]))
    else:
        out.append(Paragraph("无", s["bullet"]))
    if f.audit is not None:
        out.append(Paragraph("—— 审计留痕 ——", s["audit"]))
        out.append(Paragraph(f"机审初判：{f.audit.initial} → 人工改判：{f.audit.final}", s["audit"]))
        out.append(Paragraph(f"处置说明：{f.audit.disposition or '—'}", s["audit"]))
    out.append(Spacer(1, 6))
    return out


def render_pdf(m: ReportModel) -> bytes:
    _ensure_font()
    s = _styles()
    story: list = []

    # ① 封面
    story.append(Spacer(1, 40 * mm))
    story.append(Paragraph(m.title, s["title"]))
    story.append(Spacer(1, 16 * mm))
    for label, value in m.cover:
        story.append(Paragraph(f"{label}：{value}", s["body"]))
    story.append(Spacer(1, 20 * mm))
    story.append(Paragraph(m.footer_note, s["footer"]))
    story.append(PageBreak())

    # ② 结论页
    story.append(Paragraph("一、审查结论", s["h1"]))
    story.append(Paragraph(m.conclusion_text, s["body"]))
    story.append(Spacer(1, 6))
    rows = [["维度", "通过", "不通过", "需关注"]]
    for st in m.dimension_stats:
        rows.append([st.dimension_label, str(st.passed), str(st.failed), str(st.attention)])
    tbl = Table(rows, hAlign="LEFT")
    tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), _FONT),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0f0f0")),
    ]))
    story.append(tbl)

    # ③ 分维度发现
    story.append(Paragraph("二、分维度审查发现", s["h1"]))
    for sec in m.sections:
        story.append(Paragraph(sec.dimension_label, s["h2"]))
        for f in sec.findings:
            story.extend(_finding_flowables(f, s))

    # ④ 结尾签署
    story.append(Paragraph("三、审查说明", s["h1"]))
    story.append(Paragraph("本报告由智能立项审查系统依据规则库自动生成，人工复核记录见各条审计留痕。", s["body"]))
    story.append(Spacer(1, 10))
    story.append(Paragraph("审查人：______________        日期：______________", s["body"]))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm,
                            leftMargin=20 * mm, rightMargin=20 * mm)
    doc.build(story)
    return buf.getvalue()
```

- [ ] **Step 5: 运行确认通过**

Run: `cd backend && python -m pytest tests/test_report_render.py -v`
Expected: PASS（全部）

- [ ] **Step 6: 提交**

```bash
git add backend/requirements.txt backend/app/reporting/render_pdf.py backend/tests/test_report_render.py
git commit -m "feat(report): PDF 渲染器 render_pdf(reportlab 内置 CJK 字体)"
```

---

## Task 4：zip 打包 package_zip

**Files:**
- Create: `backend/app/reporting/package.py`
- Test: `backend/tests/test_report_render.py`（追加）

**Interfaces:**
- Produces: `package.package_zip(files: dict[str, bytes]) -> bytes`（key=zip 内文件名，value=文件字节）

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_report_render.py` 追加。顶部补充导入：

```python
import zipfile
from app.reporting.package import package_zip
```

追加测试：

```python
def test_package_zip_contains_all_files():
    data = package_zip({"a.docx": b"AAA", "b.pdf": b"%PDF-BB"})
    assert isinstance(data, bytes)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = set(z.namelist())
        assert names == {"a.docx", "b.pdf"}
        assert z.read("a.docx") == b"AAA"
        assert z.read("b.pdf") == b"%PDF-BB"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && python -m pytest tests/test_report_render.py::test_package_zip_contains_all_files -v`
Expected: FAIL（`ModuleNotFoundError: app.reporting.package`）

- [ ] **Step 3: 实现 package.py**

创建 `backend/app/reporting/package.py`：

```python
from __future__ import annotations

import io
import zipfile


def package_zip(files: dict[str, bytes]) -> bytes:
    """把 {文件名: 字节} 打包成一个 zip 的字节。"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && python -m pytest tests/test_report_render.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/reporting/package.py backend/tests/test_report_render.py
git commit -m "feat(report): zip 打包 package_zip"
```

---

## Task 5：报告组装 report_builder（纯组装 + DB 装配）

**Files:**
- Create: `backend/app/report_builder.py`
- Test: `backend/tests/test_report_builder.py`

**Interfaces:**
- Consumes: `model.*`、`styles.*`（Task 1）；`schemas.ReviewResultOut`、`schemas.CheckOut`、`schemas.EvidenceOut`（现有）
- Produces:
  - `report_builder.assemble_report_model(*, title: str, cover: list[tuple[str, str]], review_result: ReviewResultOut, resolve_evidence: Callable[[EvidenceOut], EvidenceRef]) -> ReportModel`（**DB-free 纯函数**）
  - `report_builder.build_report_model(db: Session, package_id: int) -> ReportModel`（DB 装配，thin）

- [ ] **Step 1: 写失败测试（纯组装函数）**

创建 `backend/tests/test_report_builder.py`：

```python
from app.report_builder import assemble_report_model
from app.reporting.model import EvidenceRef
from app.schemas import CheckOut, EvidenceOut, ReviewResultOut, RoundOut


def _check(**kw):
    base = dict(round_check_id=1, rule_version_id=1, rule_code="R-1", name="规则",
                dimension_code="completeness", initial_result="pass",
                initial_disposition=None, final_result=None, final_disposition=None,
                effective_result="pass", status="open", suggestion=None,
                confidence=None, severity=None, version=0, evidence=[])
    base.update(kw)
    return CheckOut(**base)


def _stub_resolver(e):
    return EvidenceRef(quote="引文", locator="材料/第1页")


def _assemble(checks, conclusion="fix"):
    rr = ReviewResultOut(round=RoundOut(round_id=1, round_no=1, conclusion=conclusion),
                         checks=checks)
    return assemble_report_model(title="立项审查报告",
                                 cover=[("项目名称", "X")], review_result=rr,
                                 resolve_evidence=_stub_resolver)


def test_overruled_check_has_audit_confirmed_does_not():
    over = _check(round_check_id=1, status="overruled", initial_result="pass",
                  final_result="fail", final_disposition="reject",
                  effective_result="fail")
    conf = _check(round_check_id=2, status="confirmed", initial_result="pass",
                  final_result="pass", effective_result="pass")
    rm = _assemble([over, conf])
    findings = rm.sections[0].findings
    by_result = {f.result_key: f for f in findings}
    assert by_result["fail"].audit is not None          # 改判 → 有留痕
    assert by_result["fail"].audit.initial == "通过"
    assert by_result["fail"].audit.final == "不通过"
    assert by_result["pass"].audit is None              # 仅 confirm → 无留痕


def test_dimension_stats_three_buckets():
    checks = [
        _check(round_check_id=1, effective_result="pass"),
        _check(round_check_id=2, effective_result="fail"),
        _check(round_check_id=3, effective_result="need_review"),
    ]
    rm = _assemble(checks)
    stat = next(s for s in rm.dimension_stats if s.dimension_label == "完整性")
    assert (stat.passed, stat.failed, stat.attention) == (1, 1, 1)


def test_evidence_resolved_and_empty_shows_via_model():
    c = _check(evidence=[EvidenceOut(segment_id=5, field_code=None,
                                     budget_item_id=None, note="见第1段")])
    rm = _assemble([c])
    ev = rm.sections[0].findings[0].evidence
    assert ev[0].quote == "引文" and ev[0].locator == "材料/第1页"


def test_conclusion_text_and_title():
    rm = _assemble([_check(effective_result="pass")], conclusion="accept")
    assert rm.title == "立项审查报告"
    assert "综合结论：通过" in rm.conclusion_text
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && python -m pytest tests/test_report_builder.py -v`
Expected: FAIL（`ModuleNotFoundError: app.report_builder`）

- [ ] **Step 3: 实现 report_builder.py（先只实现 assemble_report_model，以过纯函数测试）**

创建 `backend/app/report_builder.py`：

```python
from __future__ import annotations

from datetime import datetime
from typing import Callable

from sqlmodel import Session

from .models import (ApplicationPackage, DeclaredProject, ResearchPerson,
                     ResearchUnit, ReviewBatch, MaterialFile, ParseSegment)
from .reporting.model import (AuditTrail, DimensionStat, EvidenceRef, Finding,
                              ReportModel, Section)
from .reporting.styles import (CONCLUSION_LABELS, DIMENSION_ORDER, dimension_label,
                               result_bucket, result_label)
from .review_execution import get_review_results
from .schemas import CheckOut, EvidenceOut, ReviewResultOut

TITLE = "立项审查报告"
FOOTER = "智能立项审查系统 生成"


def _finding_of(c: CheckOut, resolve_evidence: Callable[[EvidenceOut], EvidenceRef]) -> Finding:
    audit = None
    if c.status == "overruled":   # 仅人工改判才有审计留痕；confirm 沿用初判不算
        audit = AuditTrail(initial=result_label(c.initial_result),
                           final=result_label(c.final_result or c.initial_result),
                           disposition=c.final_disposition or "—")
    return Finding(
        result_label=result_label(c.effective_result),
        result_key=c.effective_result,
        rule_code=c.rule_code, name=c.name,
        severity=c.severity, confidence=c.confidence,
        suggestion=c.suggestion or "",
        evidence=[resolve_evidence(e) for e in c.evidence],
        audit=audit,
    )


def assemble_report_model(*, title: str, cover: list[tuple[str, str]],
                          review_result: ReviewResultOut,
                          resolve_evidence: Callable[[EvidenceOut], EvidenceRef]) -> ReportModel:
    checks = review_result.checks
    # 分维度分组，按 DIMENSION_ORDER 排序，只保留有发现的维度
    by_dim: dict[str, list[CheckOut]] = {}
    for c in checks:
        by_dim.setdefault(c.dimension_code, []).append(c)

    sections: list[Section] = []
    dimension_stats: list[DimensionStat] = []
    n_pass = n_fail = n_att = 0
    for code in DIMENSION_ORDER:
        group = by_dim.get(code, [])
        if not group:
            continue
        p = sum(1 for c in group if result_bucket(c.effective_result) == "passed")
        f = sum(1 for c in group if result_bucket(c.effective_result) == "failed")
        a = sum(1 for c in group if result_bucket(c.effective_result) == "attention")
        n_pass += p; n_fail += f; n_att += a
        dimension_stats.append(DimensionStat(dimension_label=dimension_label(code),
                                             passed=p, failed=f, attention=a))
        sections.append(Section(dimension_label=dimension_label(code),
                                findings=[_finding_of(c, resolve_evidence) for c in group]))

    conclusion_code = review_result.round.conclusion if review_result.round else "pending"
    conclusion_label = CONCLUSION_LABELS.get(conclusion_code, conclusion_code)
    conclusion_text = (f"共审查规则 {len(checks)} 条，通过 {n_pass}、不通过 {n_fail}、"
                       f"需关注 {n_att}。综合结论：{conclusion_label}")

    return ReportModel(title=title, cover=cover, conclusion_text=conclusion_text,
                       dimension_stats=dimension_stats, sections=sections, footer_note=FOOTER)
```

- [ ] **Step 4: 运行确认纯函数测试通过**

Run: `cd backend && python -m pytest tests/test_report_builder.py -v`
Expected: PASS（4 项）

- [ ] **Step 5: 追加 build_report_model（DB 装配）到同文件**

在 `backend/app/report_builder.py` 末尾追加：

```python
def _cover_fields(db: Session, pkg: ApplicationPackage, conclusion_code: str) -> list[tuple[str, str]]:
    dash = "—"
    project_name = unit_name = person_name = batch_no = dash
    proj = db.get(DeclaredProject, pkg.declared_project_id) if pkg.declared_project_id else None
    if proj is not None:
        project_name = proj.project_name or dash
        unit = db.get(ResearchUnit, proj.declaring_unit_id) if proj.declaring_unit_id else None
        if unit is not None:
            unit_name = unit.name or dash
        person = db.get(ResearchPerson, proj.applicant_person_id) if proj.applicant_person_id else None
        if person is not None:
            person_name = person.name or dash
    batch = db.get(ReviewBatch, pkg.batch_id) if pkg.batch_id else None
    if batch is not None:
        batch_no = batch.batch_no or dash
    return [
        ("项目名称", project_name),
        ("申报单位", unit_name),
        ("项目负责人", person_name),
        ("审查批次", batch_no),
        ("审查结论", CONCLUSION_LABELS.get(conclusion_code, conclusion_code)),
        ("报告生成时间", datetime.now().strftime("%Y-%m-%d %H:%M")),
    ]


def build_report_model(db: Session, package_id: int) -> ReportModel:
    pkg = db.get(ApplicationPackage, package_id)
    if pkg is None:
        raise LookupError(f"application_package {package_id} not found")
    rr = get_review_results(db, package_id)
    if rr.round is None:
        raise ValueError("该申报包尚未审查，无法导出报告")

    def resolve(e: EvidenceOut) -> EvidenceRef:
        if e.segment_id is not None:
            seg = db.get(ParseSegment, e.segment_id)
            if seg is not None:
                quote = (seg.content_text or "").strip()[:120] or "—"
                mf = db.get(MaterialFile, seg.material_file_id) if seg.material_file_id else None
                page = f"第{seg.page_no}页" if seg.page_no else ""
                loc = f"{mf.file_name if mf else '材料'}{('/' + page) if page else ''}"
                return EvidenceRef(quote=quote, locator=loc)
        if e.field_code:
            return EvidenceRef(quote=e.note or "—", locator=f"字段 {e.field_code}")
        return EvidenceRef(quote=e.note or "—", locator="—")

    cover = _cover_fields(db, pkg, rr.round.conclusion)
    return assemble_report_model(title=TITLE, cover=cover, review_result=rr,
                                 resolve_evidence=resolve)
```

- [ ] **Step 6: 运行确认全部通过**

Run: `cd backend && python -m pytest tests/test_report_builder.py -v`
Expected: PASS（纯函数测试仍绿；build_report_model 由 Task 6 集成测试覆盖）

- [ ] **Step 7: 提交**

```bash
git add backend/app/report_builder.py backend/tests/test_report_builder.py
git commit -m "feat(report): report_builder 纯组装 + DB 装配(改判判据 status==overruled)"
```

---

## Task 6：导出端点 + 包导出 + README

**Files:**
- Modify: `backend/app/reporting/__init__.py`（补包级导出）
- Modify: `backend/app/routers/review.py`（加 `GET /packages/{id}/report/export`）
- Create: `backend/app/reporting/README.md`
- Test: `backend/tests/test_report_export_api.py`

**Interfaces:**
- Consumes: `report_builder.build_report_model`（Task 5）、`render_docx`、`render_pdf`、`package_zip`（Task 2/3/4）
- Produces: HTTP `GET /api/packages/{package_id}/report/export` → `200 application/zip`（含 .docx + .pdf）；未审查 → `409`；包不存在 → `404`

- [ ] **Step 1: 写失败测试（集成，seed DB）**

创建 `backend/tests/test_report_export_api.py`：

```python
import io
import zipfile

from sqlmodel import Session

from app import recognition
from app.db import engine


def _seed_rule_doc(db, decision="hard"):
    """造一个带 1 条 active 规则的规则文件，返回 (doc_id, rule_version_id)。"""
    import uuid
    from sqlalchemy import select
    from app.models import (RegulationClause, ReviewDimension, ReviewRule,
                            ReviewRuleClause, ReviewRuleVersion, StandardDoc)
    dim = db.execute(select(ReviewDimension)).scalars().first()
    assert dim is not None
    doc = StandardDoc(doc_code=f"DOC-{uuid.uuid4().hex[:8]}", title="测试规则文件",
                      file_id=None, version="V1", is_active=True)
    db.add(doc); db.flush()
    clause = RegulationClause(standard_doc_id=doc.id, doc_code=doc.doc_code,
                              clause_no="1.1", clause_text="条款", source_segment_id=None)
    db.add(clause); db.flush()
    rule = ReviewRule(rule_code=f"R-{uuid.uuid4().hex[:8]}", current_version_id=None, is_active=True)
    db.add(rule); db.flush()
    rv = ReviewRuleVersion(rule_id=rule.id, version="V1.0", dimension_id=dim.id,
                           name="必须有申请人", logic=None, decision_type=decision,
                           disposition="reject", binding_class="common")
    db.add(rv); db.flush()
    rule.current_version_id = rv.id
    db.add(ReviewRuleClause(rule_version_id=rv.id, clause_id=clause.id))
    db.commit()
    return doc.id, rv.id


def _reviewed_package(client, monkeypatch):
    """上传材料→绑配置→机审(1条fail)，返回已产生 round 的 package_id。"""
    monkeypatch.setattr(recognition, "parse_file", lambda path, ext: (
        [recognition.SegmentDraft(1, {"page": 1}, "paragraph", "申请人:张三")], None))
    files = {"files": ("申请书.docx", io.BytesIO(b"PK\x03\x04x"), "application/octet-stream")}
    pkg_id = client.post("/api/material-files", files=files).json()["package_id"]
    with Session(engine) as db:
        doc_id, rv_id = _seed_rule_doc(db)
    client.post(f"/api/packages/{pkg_id}/bind-config", json={"config_doc_id": doc_id})
    seg_id = client.get(f"/api/packages/{pkg_id}/review-input").json()["segments"][0]["segments"][0]["id"]
    payload = {"checks": [{"rule_version_id": rv_id, "initial_result": "fail",
                           "initial_disposition": "reject", "suggestion": "缺申请人",
                           "evidence": [{"segment_id": seg_id, "note": "见第1段"}]}]}
    r = client.post(f"/api/packages/{pkg_id}/review", json=payload)
    assert r.status_code == 200, r.text
    return pkg_id


def test_export_returns_zip_with_docx_and_pdf(client, monkeypatch):
    pkg_id = _reviewed_package(client, monkeypatch)
    r = client.get(f"/api/packages/{pkg_id}/report/export")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/zip"
    assert "attachment" in r.headers.get("content-disposition", "")
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        names = z.namelist()
        assert any(n.endswith(".docx") for n in names)
        assert any(n.endswith(".pdf") for n in names)
        for n in names:
            if n.endswith(".pdf"):
                assert z.read(n)[:4] == b"%PDF"


def test_export_unreviewed_package_409(client, monkeypatch):
    monkeypatch.setattr(recognition, "parse_file", lambda path, ext: (
        [recognition.SegmentDraft(1, {"page": 1}, "paragraph", "x")], None))
    files = {"files": ("a.docx", io.BytesIO(b"PK\x03\x04x"), "application/octet-stream")}
    pkg_id = client.post("/api/material-files", files=files).json()["package_id"]
    r = client.get(f"/api/packages/{pkg_id}/report/export")
    assert r.status_code == 409


def test_export_missing_package_404(client):
    r = client.get("/api/packages/999999/report/export")
    assert r.status_code == 404
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && python -m pytest tests/test_report_export_api.py -v`
Expected: FAIL（404 端点不存在 → 现返回 404 但 zip 测试失败，或路由未注册返回 405/404）

- [ ] **Step 3: 补包级导出 `reporting/__init__.py`**

把 `backend/app/reporting/__init__.py` 内容改为：

```python
from .model import (AuditTrail, DimensionStat, EvidenceRef, Finding, ReportModel,
                    Section)
from .package import package_zip
from .render_docx import render_docx
from .render_pdf import render_pdf

__all__ = ["AuditTrail", "DimensionStat", "EvidenceRef", "Finding", "ReportModel",
           "Section", "package_zip", "render_docx", "render_pdf"]
```

- [ ] **Step 4: 加端点到 `backend/app/routers/review.py`**

在 `backend/app/routers/review.py` 顶部导入区追加：

```python
from urllib.parse import quote as _urlquote
from fastapi import Response
from ..report_builder import build_report_model
from ..reporting import package_zip, render_docx, render_pdf
```

在文件末尾追加端点：

```python
@router.get("/packages/{package_id}/report/export")
def export_report(package_id: int, db: Session = Depends(get_session)) -> Response:
    try:
        m = build_report_model(db, package_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    docx_bytes = render_docx(m)
    pdf_bytes = render_pdf(m)
    base = f"立项审查报告_包{package_id}"
    zip_bytes = package_zip({f"{base}.docx": docx_bytes, f"{base}.pdf": pdf_bytes})
    fname = f"{base}.zip"
    disposition = f"attachment; filename=report_{package_id}.zip; filename*=UTF-8''{_urlquote(fname)}"
    return Response(content=zip_bytes, media_type="application/zip",
                    headers={"Content-Disposition": disposition})
```

- [ ] **Step 5: 运行确认通过**

Run: `cd backend && python -m pytest tests/test_report_export_api.py -v`
Expected: PASS（3 项）

- [ ] **Step 6: 写 README 契约文档**

创建 `backend/app/reporting/README.md`：

```markdown
# reporting —— 审查报告渲染（自包含可移植包）

把一份**通用报告数据模型 `ReportModel`** 渲染成 Word（.docx）与 PDF，并可打包 zip。
本包**审查类型无关**：只依赖 `ReportModel` + `python-docx` + `reportlab`，不 import 任何本项目的 models/db。

## 契约 ReportModel

见 `model.py`。核心结构：
- `ReportModel(title, cover: list[(label, value)], conclusion_text, dimension_stats, sections, footer_note)`
- `Section(dimension_label, findings)`
- `Finding(result_label, result_key, rule_code, name, severity, confidence, suggestion, evidence, audit)`
- `EvidenceRef(quote, locator)`；`AuditTrail(initial, final, disposition)`（`audit=None` 表示未改判，不渲染留痕）
- `DimensionStat(dimension_label, passed, failed, attention)`

## 用法

```python
from app.reporting import render_docx, render_pdf, package_zip
docx = render_docx(model)
pdf = render_pdf(model)
zip_bytes = package_zip({"报告.docx": docx, "报告.pdf": pdf})
```

## 移植到别的部署

1. 拷贝整个 `reporting/` 文件夹。
2. 安装依赖：`python-docx`、`reportlab`。
3. 写一个自己的 builder，把你的数据翻译成 `ReportModel`（参考本项目 `app/report_builder.py`）。
4. 渲染器一行不改。

## 依赖

- `python-docx`（Word）
- `reportlab`（PDF；用内置 CID 字体 `STSong-Light` 出中文，无需附带字体文件）
```

- [ ] **Step 7: 提交**

```bash
git add backend/app/reporting/__init__.py backend/app/reporting/README.md backend/app/routers/review.py backend/tests/test_report_export_api.py
git commit -m "feat(report): 导出端点 GET /report/export + 包导出 + README"
```

---

## Task 7：前端 API exportPackageReport

**Files:**
- Modify: `src/api/review.ts`（追加函数）
- Test: `src/api/review.export.test.ts`

**Interfaces:**
- Produces: `exportPackageReport(packageId: number): Promise<void>`（fetch zip → 触发浏览器下载）

- [ ] **Step 1: 写失败测试**

创建 `src/api/review.export.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportPackageReport } from "./review";

describe("exportPackageReport", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => vi.restoreAllMocks());

  it("GET 正确 URL 并触发下载（含文件名）", async () => {
    const blob = new Blob(["zipbytes"], { type: "application/zip" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(blob, { status: 200, headers: {
        "Content-Disposition": "attachment; filename=report_3.zip; filename*=UTF-8''%E6%8A%A5%E5%91%8A.zip",
      } })));
    const createURL = vi.fn().mockReturnValue("blob:x");
    const revokeURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: createURL, revokeObjectURL: revokeURL });
    const click = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);

    await exportPackageReport(3);

    expect(fetch).toHaveBeenCalledWith("/api/packages/3/report/export");
    expect(createURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeURL).toHaveBeenCalledWith("blob:x");
  });

  it("非 2xx 抛错", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("尚未审查", { status: 409 })));
    await expect(exportPackageReport(3)).rejects.toThrow("HTTP 409");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/api/review.export.test.ts`
Expected: FAIL（`exportPackageReport` 未导出）

- [ ] **Step 3: 实现 exportPackageReport**

在 `src/api/review.ts` 末尾追加：

```typescript
function filenameFromDisposition(cd: string, fallback: string): string {
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) {
    try { return decodeURIComponent(star[1]); } catch { /* ignore */ }
  }
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain ? plain[1] : fallback;
}

export async function exportPackageReport(packageId: number): Promise<void> {
  const res = await fetch(`/api/packages/${packageId}/report/export`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const filename = filenameFromDisposition(cd, `立项审查报告_包${packageId}.zip`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/api/review.export.test.ts`
Expected: PASS（2 项）

- [ ] **Step 5: 提交**

```bash
git add src/api/review.ts src/api/review.export.test.ts
git commit -m "feat(web): exportPackageReport fetch-blob 下载审查报告 zip"
```

---

## Task 8：前端「导出报告」按钮

**Files:**
- Modify: `src/components/review/ReviewWorkbench.tsx`
- Test: `src/components/review/ReviewWorkbench.export.test.tsx`

**Interfaces:**
- Consumes: `exportPackageReport`（Task 7）；现有 `getPackageReview`
- Produces: `ReviewWorkbench` 顶部「导出报告」按钮（仅已审查时可见），点击调 `exportPackageReport(packageId)`，含 loading 与失败 toast

- [ ] **Step 1: 写失败测试**

创建 `src/components/review/ReviewWorkbench.export.test.tsx`：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReviewWorkbench from "./ReviewWorkbench";
import * as reviewApi from "../../api/review";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const reviewedData = {
  round: { round_id: 1, round_no: 1, conclusion: "fix" },
  checks: [{
    round_check_id: 1, rule_version_id: 1, rule_code: "R-1", name: "规则",
    dimension_code: "completeness", initial_result: "fail", initial_disposition: "reject",
    final_result: null, final_disposition: null, effective_result: "fail",
    status: "open", suggestion: "缺", confidence: 0.9, severity: 3, version: 0, evidence: [],
  }],
};

describe("ReviewWorkbench 导出报告按钮", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => vi.restoreAllMocks());

  it("已审查时显示按钮并可点击触发导出", async () => {
    vi.spyOn(reviewApi, "getPackageReview").mockResolvedValue(reviewedData as never);
    const spy = vi.spyOn(reviewApi, "exportPackageReport").mockResolvedValue(undefined);
    renderWithClient(<ReviewWorkbench packageId={7} />);
    const btn = await screen.findByRole("button", { name: /导出报告/ });
    fireEvent.click(btn);
    await waitFor(() => expect(spy).toHaveBeenCalledWith(7));
  });

  it("未审查(round=null)时不显示按钮", async () => {
    vi.spyOn(reviewApi, "getPackageReview").mockResolvedValue({ round: null, checks: [] } as never);
    renderWithClient(<ReviewWorkbench packageId={7} />);
    await waitFor(() => expect(screen.getByText(/尚未形式审查/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /导出报告/ })).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/review/ReviewWorkbench.export.test.tsx`
Expected: FAIL（找不到「导出报告」按钮）

- [ ] **Step 3: 加按钮到 ReviewWorkbench**

在 `src/components/review/ReviewWorkbench.tsx` 导入区，把第一行 antd 导入和 api 导入改为：

```typescript
import { message, Button } from "antd";
```
```typescript
import { getPackageReview, postReviewAction, exportPackageReport,
         type ReviewCheck, type PackageReview } from "../../api/review";
```

在组件内 `const confirm = ...` 之前，加导出状态与处理器：

```typescript
  const [exporting, setExporting] = useState(false);
  const onExport = async () => {
    setExporting(true);
    try {
      await exportPackageReport(packageId);
    } catch (e) {
      message.error("报告导出失败：" + (e as Error).message);
    } finally {
      setExporting(false);
    }
  };
```

把 `return (` 里 `<VerdictBanner .../>` 那一行用一个带按钮的头部行包起来，替换为：

```typescript
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <VerdictBanner conclusion={data.round.conclusion} counts={counts} reviewed={reviewed} total={checks.length} />
        </div>
        <Button type="primary" loading={exporting} onClick={onExport}>导出报告</Button>
      </div>
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/components/review/ReviewWorkbench.export.test.tsx`
Expected: PASS（2 项）

- [ ] **Step 5: 全量前端测试 + 构建**

Run: `npx vitest run && npx tsc -b`
Expected: 全绿、tsc 零错误。

- [ ] **Step 6: 提交**

```bash
git add src/components/review/ReviewWorkbench.tsx src/components/review/ReviewWorkbench.export.test.tsx
git commit -m "feat(web): 审查结果页加『导出报告』按钮(Word+PDF zip)"
```

---

## 收尾验证（全部任务完成后）

- [ ] 后端全量：`cd backend && python -m pytest`（全绿）
- [ ] 前端全量：`npx vitest run`（全绿）
- [ ] 构建：`npx tsc -b`（零错误）
- [ ] 端到端手验（用 verify 技能）：起后端+前端 → 打开一个已审查申报包结果页 → 点「导出报告」→ 下载 zip → 解压确认 .docx 与 .pdf 都能打开、中文不乱码、被改判条目有审计留痕。

---

## Self-Review 结论（本计划对 spec 的覆盖）

- 封面/结论页/分维度发现/签署 → Task 2/3 渲染 + Task 5 组装 ✓
- Word（python-docx）+ PDF（reportlab 内置 CJK）→ Task 2/3 ✓
- 一键出双份打 zip → Task 4 + Task 6 ✓
- 改判留痕仅 overrule → Task 5 判据 `status=="overruled"` + Task 5/2/3 测试 ✓
- 自包含可移植包 + README 契约 → Task 1~4 + Task 6 README ✓
- 前端按钮 + fetch-blob 下载 + loading/错误 → Task 7/8 ✓
- 边界：未审查 409、缺字段"—"、无出处"无"、PDF 中文兜底 → Task 5/6 测试 + 渲染实现 ✓
- 读端点不加鉴权 → Task 6 端点无 `require_api_key` ✓
