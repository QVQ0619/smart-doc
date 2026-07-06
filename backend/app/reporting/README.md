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
