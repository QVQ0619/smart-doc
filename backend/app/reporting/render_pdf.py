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
