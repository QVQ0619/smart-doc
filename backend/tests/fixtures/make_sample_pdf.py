"""一次性生成测试用 fixture PDF（2 页 + 一张有边框表格）。
运行: pip install reportlab && python backend/tests/fixtures/make_sample_pdf.py
产物 sample.pdf 需提交进仓库；reportlab 不进 requirements。"""
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, PageBreak, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

OUT = Path(__file__).with_name("sample.pdf")


def main() -> None:
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(str(OUT), pagesize=A4)
    story = [
        Paragraph("FIRST PAGE PARAGRAPH ONE", styles["Normal"]),
        Spacer(1, 24),
        Paragraph("FIRST PAGE PARAGRAPH TWO", styles["Normal"]),
        PageBreak(),
        Paragraph("SECOND PAGE PARAGRAPH", styles["Normal"]),
        Spacer(1, 24),
        Table(
            [["COL_A", "COL_B"], ["CELL_1", "CELL_2"]],
            style=TableStyle([("GRID", (0, 0), (-1, -1), 1, colors.black)]),
        ),
    ]
    doc.build(story)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
