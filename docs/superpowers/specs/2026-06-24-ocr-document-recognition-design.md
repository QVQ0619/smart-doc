# 文档识别增加 OCR 能力 + 后台识别 — 设计文档

- 日期：2026-06-24
- 范围：smart-doc 后端「文档识别」子项目的增强
- 状态：已与用户敲定方向，待实现

## 1. 背景与问题

当前识别逻辑在 `backend/app/recognition.py`，agent 的 skill 只是触发它。三个盲区：

1. **扫描件 / 图片型 PDF**：`parse_pdf` 只读 PDF 文本层（`page.extract_text()`），扫描件每页是图、无文本层 → 抽不到字 → 走到 `recognition.py` 的「可能是扫描件（暂不支持 OCR）」。
2. **图片文件**（.jpg/.png/.tiff）：被当成不支持的格式直接抛掉（`UnsupportedFormatError`）。
3. **混合 PDF**（部分页有文字、部分页扫描图）：扫描页静默丢失，不报错但内容缺失。

两个约束影响方案落地：
- **识别是同步的**：`upload` 内联调用（`standard_docs.py`），OCR 很慢，大扫描件会阻塞上传请求几十秒。
- **DB `segment_type` 白名单只有 `title/text/table`**：纯 OCR 出的是流式文本，表格结构会丢，只能落 `text`。

## 2. 已定方向（用户决策）

| 决策点 | 选择 |
|---|---|
| OCR 引擎 | **RapidOCR 本地**（onnxruntime，纯 pip，自带中文模型，离线免费，数据不外发） |
| PDF 栅格化 | **PyMuPDF (fitz)**，纯 pip，避开 poppler/Tesseract 系统二进制 |
| 执行方式 | **改后台任务**，上传秒回 `processing`，前端轮询 |
| agent/shim 流程 | **shim 轮询至 done 再抽条款**，保证后续抽取拿得到段落 |

## 3. 架构与依赖

- 新增 `backend/app/ocr.py`，隔离所有 OCR 逻辑；`recognition.py` 只调用其接口。
- 依赖加入 `backend/requirements.txt`：
  - `rapidocr-onnxruntime` — OCR 引擎，自带中文模型
  - `pymupdf` — PDF 页栅格化为图片
- **可选 import**：`ocr.py` 顶部 `try: import … except ImportError: OCR_AVAILABLE = False`。未安装时 OCR 整体静默关闭，docx / 文本层 PDF 流程与现有 31 条后端测试零影响。

## 4. 模块设计

### 4.1 `ocr.py`（小而清晰的接口）

```
OCR_AVAILABLE: bool
ocr_image(path: Path) -> list[str]        # 图片 -> 文本行列表
ocr_pdf_page(page: fitz.Page) -> list[str] # PDF 单页栅格化(~250 DPI) -> 文本行
```

- RapidOCR 引擎为**延迟初始化的单例**：首次调用才加载模型，不拖慢应用启动。
- 栅格化 DPI ≈ 250（中文识别质量与速度的平衡点）。
- 接口只吐「文本行列表」，由 `recognition.py` 负责拼段落与落库，职责清晰。

### 4.2 `recognition.py` 改造

- `parse_pdf` **按页回退**：每页先 `extract_text()`；空文本页用 PyMuPDF 渲染 → `ocr_pdf_page` → 文本行拼成段落 draft。混合 PDF 自动各页各走各的路径。
- 新增**图片分支**：扩展名 `.png/.jpg/.jpeg/.tiff` → `ocr_image` → drafts。
- 落库约定：OCR 段 `segment_type=text`、`locator={"page":n,"block_index":i,"ocr":true}`、保留 `page_no`。扫描件中的表格不还原结构（落 `text`，符合 DB 白名单）。
- 降级文案：检测到扫描件/图片但 `OCR_AVAILABLE=False` 时，提示：
  > 「检测到扫描件/图片，但未安装 OCR 组件，请在 backend 下 `pip install rapidocr-onnxruntime pymupdf` 后重试。」

### 4.3 状态机 + 后台任务

- 状态流转：`pending → processing → done / failed`。
  `models.py` 的 `recognition_status` 已是字符串字段，无需数据库迁移。
- **上传**（`standard_docs.py` 的内联识别）：改用 FastAPI `BackgroundTasks`。先将状态置 `processing` 并秒回，OCR 在后台跑完后更新 `done/failed` 与 `recognition_error`。
- **`/recognize` 端点**：同样置 `processing` + 后台触发，立即返回 `processing`。
- **卡死恢复**：BackgroundTasks 是进程内、无持久化；reload/重启可能让文档永久卡在 `processing`。应用启动钩子（`main.py` startup）把残留 `processing` 重置为 `pending`；外加现有「重新识别」按钮可手动重触。

### 4.4 前端（改动很小，已有轮询基础设施）

- `StandardDocLibrary.tsx` 已有 `refetchInterval: 10000` 轮询与 `pending` 状态。
- 改动：
  - `STATUS` map 增加 `processing: { color: "blue", text: "识别中" }`。
  - 轮询：`refetchInterval` 改为动态函数 —— 列表中存在 `processing` 行时返回 3s，否则返回 10s。
  - 「重新识别」mutation：响应变为 `processing` 后提示「识别中…」，最终的 done/failed 提示交给轮询接管。

### 4.5 agent/shim 流程

- `agent_shim/smart_doc_add.py`：上传后**轻量轮询**文档状态，等到 `done/failed` 再返回，保证 agent 后续抽条款能拿到段落。
- 轮询设超时上限（约 120s）与间隔（约 2–3s），超时按当前状态返回并提示。

## 5. 数据流

```
上传/重识别
  -> 置 processing, 立即返回
  -> 后台: 打开文件
       .docx           -> parse_docx (原逻辑)
       .pdf  每页:      有文本层 -> extract_text
                        空文本页 -> PyMuPDF 渲染 -> RapidOCR
       .png/.jpg/...    -> RapidOCR
  -> 写 parse_segment, 置 done; 异常置 failed + error
前端 / shim 轮询状态 -> done 后展示段落 / 继续抽条款
```

## 6. 测试策略

- fixture：测试时用 Pillow **现生成**一张带中文的小图（不提交二进制文件）；构造一页扫描版 PDF。
- 用例：
  1. 图片文件 OCR 出文本并入库。
  2. 混合 PDF：文本页 + 扫描页内容都进库。
  3. `OCR_AVAILABLE=False` 时走降级提示、不报错、不影响 docx/文本 PDF。
  4. 后台任务状态流转 `pending → processing → done`。
  5. startup 重置残留 `processing → pending`。
- 现有后端 pytest（31 绿）不得退步。

## 7. 风险与权衡

- 首次模型加载 + CPU 每页约 1–3s（已用后台任务化解请求阻塞）。
- 扫描质量差 / 手写体识别仍弱；表格丢失结构（后续可选 PP-Structure，本轮不做）。
- BackgroundTasks 进程内、无持久化 → 靠 startup 重置 + 手动「重新识别」兜底。
- 模型体积（数十 MB）随首次识别下载/加载，需在部署说明中提示。

## 8. 不在本轮范围（YAGNI）

- PP-Structure / 表格结构还原。
- OCR 置信度阈值与垃圾文本过滤。
- 持久化任务队列（Celery 等）替代 BackgroundTasks。
