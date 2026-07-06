# 审查报告一键导出（Word + PDF）设计

日期：2026-07-06
状态：设计已认可，待评审 → 写实现计划

## 1. 目标

在审查执行完成后，用户可在审查结果页（`ReviewWorkbench`）**一键导出**当前申报包的审查报告，
**同时**生成 Word（.docx）与 PDF 两个版本，打包为一个 zip 下载。

报告为**正式排版**（无硬性官方模板）：封面 + 审查结论 + 分维度发现表 + 出处，
且**保留人工改判的审计留痕**。

## 2. 关键决策（讨论确定）

| 维度 | 决定 |
|---|---|
| 报告格式 | B：无固定模板，但要正式；样式我们设计、用户认可 |
| 运行环境 | C：本地 Windows + Docker 都要稳 → **纯 Python、零系统依赖** |
| 交互 | A：一个按钮同时出 Word + PDF，打包成一个 zip 下载 |
| 内容范围 | B：最终生效结果 + 改判审计留痕（体现审查留痕） |
| 复用范围 | A：本次只做立项审查，但渲染器做成**审查类型无关**，留复用接缝 |
| 封装形态 | 不做 Blade agent skill；做成**自包含可移植后端子包**（获得 skill 式可移植性，避开沙箱/隧道/二进制送达问题） |

**为什么不做成 skill：** 报告生成是零 LLM 的确定性操作；skill 在远端沙箱执行、依赖隧道、
且无法把二进制文件推给浏览器下载。用户真实诉求是"可移植/自包含"，用自包含子包同样达成，
且更稳、可单测、文件直接下浏览器。

## 3. 现状（已就绪的数据）

- `GET /packages/{id}/review` 已返回 `round.conclusion` + `checks[]`
  （规则号、名称、六维度、生效结果、建议、置信度、严重度、`evidence[]` 出处）。
- 前端 `ReviewWorkbench` 已把这份数据渲染成结论横幅 + 统计卡 + 六维分组 + 发现卡片。
- 依赖：`python-docx` **已装**；**无 PDF 生成库** → 本设计新增 `reportlab`（纯 Python）。
- 封面元数据来源：`declared_project`（项目名）、`package_member`（负责人/成员）、
  `extracted_field`（申报单位等标量）、`round.conclusion`（结论）、生成时刻（审查日期）。

## 4. 报告版式

页面顺序：**封面页 → 审查结论页 → 分维度发现（正文主体）→ 结尾签署**。Word/PDF 结构一致。

### 4.1 封面页
- 大标题：`立项审查报告`（居中）
- 键值字段：项目名称 / 申报单位 / 项目负责人 / 审查批次(batch_no) / 审查结论(色点+文字) / 报告生成时间
- 页脚署名：`智能立项审查系统 生成`
- 缺失字段填 `"—"`，不报错。

### 4.2 审查结论页
- 结论段：`共审查规则 N 条，通过 X、不通过 Y、需关注 Z；综合结论：【…】`
- 六维度统计小表：维度 × (通过/不通过/关注)。维度顺序/标签复用与前端一致的常量。

### 4.3 分维度发现（正文主体）
按六维度分节，每节内每条规则一个"发现块"：
- 结果徽章（通过=绿 / 不通过=红 / 关注=橙，与前端配色一致）+ 规则号 + 名称 + 严重度
- 置信度
- 审查意见（suggestion）
- 依据出处：逐条 `evidence[]` 引文 + 定位（材料名/页码）；**无出处时该行显示"无"**（不留空）
- **审计留痕块（仅当该条被人工 overrule 改判时出现）**：
  `机审初判：X → 人工改判：Y`；`处置说明：…`。仅 confirm 的不显示。

### 4.4 结尾签署
- 审查说明段：本报告由系统依据规则库自动生成，人工复核记录见各条审计留痕。
- 预留手写签署位：`审查人：____  日期：____`

## 5. 后端架构（自包含可移植包）

核心思路：把"通用能力"与"本项目耦合"彻底切开，前者零耦合、可整包搬走。

```
backend/app/reporting/            ← 自包含子包（移植时整个文件夹搬走）
├─ __init__.py
├─ model.py         ← ReportModel 纯数据契约（dataclass，零外部依赖）
├─ styles.py        ← 维度顺序/标签/配色 常量（两渲染器共用真源）
├─ render_docx.py   ← 只依赖 python-docx + model     ← 可移植核心
├─ render_pdf.py    ← 只依赖 reportlab + model        ← 可移植核心
├─ package.py       ← 把 docx+pdf 打成 zip
└─ README.md        ← 契约文档：ReportModel 结构 + 复用步骤

backend/app/report_builder.py     ← 唯一耦合本项目：读 ApplicationPackage → ReportModel
backend/app/routers/review.py     ← 新增 GET /packages/{id}/report/export
```

### 5.1 通用契约 `ReportModel`（审查类型无关）
```
ReportModel:
  title: str                    # "立项审查报告"（参数，不写死）
  cover: dict[str, str]         # 封面字段键值对
  conclusion_text: str
  dimension_stats: [{dim, pass_, fail, attention}, ...]
  sections: [
    { dimension, findings: [
        { result, rule_code, name, severity, confidence,
          suggestion, evidence: [{quote, locator}],
          audit: {initial, final, disposition} | None }   # None = 未改判
    ]}
  ]
  footer_note: str
```

### 5.2 端点
```
GET /packages/{id}/report/export
  · build_report_model(db, id) → ReportModel
  · render_docx + render_pdf → package_zip
  · StreamingResponse(application/zip)，带 Content-Disposition 文件名
    （如 立项审查报告_包3_20260706.zip）
  · 读端点，按现有约定不加 X-API-Key
  · round is None → 409 + 明确文案
```

### 5.3 移植步骤（将来别的部署）
拷 `reporting/` → 装 `reportlab`/`python-docx` → 照 README 写自己的 builder 产出 `ReportModel` → 完。
**渲染器一行不改。**

### 5.4 新增依赖
仅 `reportlab`（纯 Python，写入 `backend/requirements.txt`）；`python-docx` 已在。
PDF 中文用 reportlab 内置 CID 字体 `STSong-Light`，**不附带字体文件、Windows/Linux 都能出中文**。

## 6. 前端

### 6.1 按钮
- 位置：`ReviewWorkbench` 顶部、`VerdictBanner` 同行右上。
- 文案：`导出报告`（一次点击出 Word+PDF 的 zip）。
- 可用条件：`ReviewWorkbench` 在 `round === null` 时已整体短路返回提示、不渲染工作台，故按钮**天然只在已审查时出现**（不显示 vs 置灰：定为不显示）。
- 加载态：点击进 loading（"生成中…"），完成/失败复位，防重复点击。

### 6.2 下载流程（二进制，不走现有 JSON `handle<T>` 路径）
`src/api/review.ts` 新增 `exportPackageReport(packageId): Promise<void>`：
1. `fetch('/api/packages/{id}/report/export')`（GET，读端点不带 X-API-Key）
2. 非 2xx → 抛错（组件 catch 弹 `message.error`）
3. `res.blob()` 拿 zip 二进制
4. 从 `Content-Disposition` 取文件名
5. 造临时 `<a href=URL.createObjectURL(blob) download=文件名>` → click → 撤销 URL

组件内 `exporting` 状态控制按钮 loading 与错误 toast。

**为什么 fetch-blob 而非直接 `<a href>` 跳转：** 直接跳转拿不到 loading 态、无法优雅弹错误。

## 7. 测试策略

### 后端（pytest，沿用 `backend/tests/` 风格）
- `render_docx(model)`：python-docx 反读，断言标题/结论/六维标题/发现字段/改判留痕文字都在。
- `render_pdf(model)`：字节以 `%PDF` 开头、非空；pdfplumber（已装）抽文本断言中文渲染出来（验字体不乱码）。
- `build_report_model(db, pkg)`：seed 审查包，断言封面字段、维度统计、**改判条目有 audit / 仅 confirm 无 audit**。
- `GET /report/export`：200、`application/zip`、有 `Content-Disposition`；zipfile 打开断言含 2 个文件。
- 缺元数据：封面填 `"—"` 不抛错。
- 未审查（round is None）：409 + 明确文案。

### 前端（vitest，沿用 `src/api/*.test.ts` + 组件测试）
- `exportPackageReport(id)`：命中正确 URL；mock blob → 触发下载（spy `createObjectURL`/`<a>.click`）。
- 按钮渲染：`round !== null` 显示可点；`round === null` 不显示/置灰。
- 交互：点击进 loading；fetch 失败调 `message.error`。

## 8. 边界情况

1. 未审查就导出 → 后端 409 + 明确文案；前端本就不显示按钮（双保险）。
2. 封面字段缺失 → 填 `"—"`。
3. 某发现无出处 → 出处行显示"无"。
4. 仅 confirm 未 overrule → 不渲染审计留痕块。
5. PDF 中文 → reportlab 内置 `STSong-Light`，pdfplumber 抽文本兜底验证。
6. 报告很大 → `StreamingResponse`，内存可控。
7. 重复点击 → loading 期间按钮禁用，防并发。

## 9. 非目标（YAGNI）

- 不做 Blade agent skill 版本。
- 不做其它审查类型的 builder（仅留渲染器接缝，将来增量加）。
- 不做报告在线预览（本次只做下载；将来可另议）。
- 不做多轮审查对比报告。
