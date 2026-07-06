# 项目批次重构（方案 A · 含批次管理）实现计划

> 原型(已用户认可): `docs/mockups/batch-redesign.html`
> 起点 BASE: 当前 master HEAD（与并行的"形式审查子项目D"同分支，文件域基本不重叠：D 在 `src/components/review/`，本项目在批次/库相关组件与后端 batch 域）。
> 工作流: subagent-driven-development；**本子项目用独立账本** `.superpowers/sdd/progress-batch.md`（避免与并行 D 会话争用 `progress.md`）。

---

## 1. 背景与目标

把现在扁平的「资源库」三件套（规则库 / 配置包 / 审查文档库，均为全局列表）重构为**以"项目批次"为中心的层级**：

```
项目批次（菜单单入口，替代原资源库组）
 └ 批次列表（卡片网格）
     └ 批次详情（元信息 + 绑定规则集；Tabs：规则库 / 配置包 / 审查文档库）
         └ 规则库 → 规则文件卡片 → 规则详情（审查规则按维度分组美化 / 依据条款）
```

同时完成视觉升级：规则文件**列表→卡片**、审查规则**小表格→维度分组信息卡**、去掉浏览态"绑定"列、原文件站内预览沿用既有 `FilePreviewModal`。

## 2. 已锁定决策（来自设计讨论）

| 项 | 定论 |
|---|---|
| 批次模型 | 真批次层级，含列表/详情/新建/绑定 |
| 批次↔规则 | **N:M**，一批次绑多份规则文件 → 新增 `batch_rule_doc` 关联表；批次规则库=并集 |
| 配置包 | 收进批次详情只读 Tab，从绑定规则文件派生（复用 `/config-packages` 口径，按绑定文件过滤） |
| 审查规则 | 独立详情页 + 面包屑返回 |
| 新建批次字段 | 最小集：批次号 + 申报期；项目类型/阶段用占位默认值 |
| 全局视图 | 不保留独立全局库菜单；规则文件仍是全局资产（绑定弹窗里勾选） |
| 材料归属 | `application_package.batch_id` 已非空；遗留落默认批次，新上传带目标批次 |

## 3. 数据模型变更

### 3.1 新表 `batch_rule_doc`（批次↔规则文件 N:M）
```sql
CREATE TABLE batch_rule_doc (
  id              BIGINT      NOT NULL AUTO_INCREMENT,
  batch_id        BIGINT      NOT NULL,
  standard_doc_id BIGINT      NOT NULL,
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_brd (batch_id, standard_doc_id),
  KEY idx_brd_doc (standard_doc_id),
  CONSTRAINT fk_brd_batch FOREIGN KEY (batch_id)        REFERENCES review_batch(id),
  CONSTRAINT fk_brd_doc   FOREIGN KEY (standard_doc_id) REFERENCES standard_doc(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
落地四处（缺一不可）：
1. `docs/file/审查系统-schema_mysql.sql` 末尾追加上述 CREATE（测试库 `smart_test` 自动建表）。
2. **生产迁移**：`docs/file/migrations/2026-06-26-batch_rule_doc.sql`（仅含该表 CREATE；交用户对 `smart` 库执行）。
3. SQLModel 模型 `BatchRuleDoc`（`backend/app/models.py`，并入 `__all__`）。
4. `backend/tests/conftest.py` 清理段加 `DELETE FROM batch_rule_doc`（在 `review_batch` 删除之前）。

### 3.2 `create_review_package` 加 `batch_id` 入参
```python
def create_review_package(db: Session, batch_id: int | None = None) -> int:
    refs = ensure_default_master_data(db)
    target_batch = batch_id if batch_id is not None else refs.batch_id   # None=默认批次兜底
    ...
```
保持向后兼容：不传 = 默认批次（现有调用点零改动）。

## 4. 后端 API 契约（新增）

所有**写**端点加 `dependencies=[Depends(require_api_key)]`（X-API-Key），读端点不鉴权——与现有约定一致。

| 方法 | 路径 | 入 | 出 |
|---|---|---|---|
| GET | `/batches` | — | `list[BatchOut]` |
| POST | `/batches` | `BatchCreateIn{batch_no, declare_period?}` | `BatchOut` |
| GET | `/batches/{id}` | — | `BatchDetailOut` |
| POST | `/batches/{id}/bind-rule-docs` | `BindRuleDocsIn{standard_doc_ids:int[]}` | `BindRuleDocsResult{bound_count}` |
| GET | `/batches/{id}/standard-docs` | — | `list[StandardDocOut]`（绑定子集，复用现有 StandardDoc 形状） |
| GET | `/batches/{id}/packages` | — | `list[MaterialPackageOut]`（复用 MaterialLibrary 现形状，按 batch 过滤） |

Schema 形状：
- `BatchOut`: `{id, batch_no, project_type_name, stage_name, status, declare_period, material_count, rule_doc_count, rule_count}`
- `BatchDetailOut`: `BatchOut` + `{rule_docs: StandardDocOut[]}`（材料/配置在专用端点取，避免巨型聚合）
- `BatchCreateIn.batch_no` 必填且 batch 内唯一（重复 → 422）；`declare_period` 可空。
- `create_batch` 复用 `ensure_default_master_data` 的占位 project_type/stage/sys_user。

> 配置包 Tab：前端调 `GET /config-packages` 后按 `batch detail.rule_docs` 的 doc_id 过滤；**本期不动** `config_packages.py`。

## 5. 前端路由与页面

当前 `useRouteStore` 是无参的 `RouteKey`。需升级为**带参路由 + 面包屑栈**：

```ts
type Nav =
  | { name: "batch-list" }
  | { name: "batch-detail"; batchId: number; batchTitle: string }
  | { name: "rule-detail"; docId: number; docTitle: string; batchId: number; batchTitle: string }
  | { name: <其余既有 RouteKey> };
// store: { nav: Nav; push(nav); reset(name) } —— 面包屑由 nav 自身字段渲染，无需独立栈
```

`menuConfig`：删「资源库」组，加 `{ key:"batch-list", label:"项目批次", icon:<AppstoreOutlined/> }`。其余菜单项（工作台/审查/系统）不变。`App.tsx` 按 `nav.name` 分发。

新页面/组件（均入 `src/pages/batch/` 或 `src/components/batch/`）：
`BatchListPage` · `BatchDetailPage` · `RuleDetailPage` · `BatchCard` · `RuleDocCard` · `CreateBatchModal` · `BindRuleDocsModal` · `DimensionRuleGroup` · `RuleItemCard`。
复用：`MaterialLibrary`（挪进批次详情 Tab，加 `batchId` 作用域 prop）、`FilePreviewModal`。

---

## 6. 任务拆分（依赖序：后端基座 → 前端 → 材料归批次）

### 阶段一 · 后端批次基座

**T1 — `batch_rule_doc` 表 + 绑定服务**
- 文件：schema SQL 追加建表；新迁移 SQL；`models.py` 加 `BatchRuleDoc`+`__all__`；`conftest.py` 清理；`backend/app/batches.py`（新）`bind_rule_docs(db, batch_id, doc_ids)`（幂等：先删该 batch 全部绑定再插，或差集；用 UNIQUE 兜底）、`list_batch_rule_docs(db, batch_id)`。
- 测试：`tests/test_batches_service.py` — 绑定写入/幂等重绑/解绑（传空集）/未知 batch 或 doc 报错。
- 模型：cheap（机械建模+服务）。

**T2 — `GET /batches` + `POST /batches`**
- 文件：`schemas.py` 加 `BatchOut/BatchCreateIn`；`batches.py` 加 `list_batches(db)`（聚合 material_count via application_package、rule_doc_count via batch_rule_doc、rule_count via 绑定文件的派生规则数，口径对齐 `config_packages.list_config_packages`）、`create_batch(db, body)`；新 `routers/batches.py` 注册进 `main`/`routers/__init__`。
- 测试：`tests/test_batches_api.py` — 空列表、建批次回读、batch_no 重复 422、X-API-Key 缺失 401/403（参照 `test_auth` 风格）、计数正确。
- 模型：standard。

**T3 — `GET /batches/{id}` 详情 + `bind-rule-docs` + 子集端点**
- 文件：`schemas.py` 加 `BatchDetailOut/BindRuleDocsIn/BindRuleDocsResult`；`batches.py` 加 `get_batch_detail`、`list_batch_standard_docs`、`list_batch_packages`（后者复用 `materials.py` 现有列包逻辑加 batch 过滤）；`routers/batches.py` 加三路由 + bind（写鉴权）。
- 测试：详情含绑定文件、绑定后 rule_docs 变化、未知 id 404、bind 写鉴权。
- 模型：standard。

### 阶段二 · 前端 IA 与页面

**T4 — 路由升级 + 菜单单入口**
- 文件：`store/useRouteStore.ts` 升级为带参 `nav`；`layout/menuConfig.tsx` 改组；`layout/SideMenu.tsx` 选中态按 `nav.name`；`App.tsx` 分发新页（页面先用占位组件，后续任务填充）。
- 测试：`useRouteStore` push/reset 单测；`SideMenu`/`App` 渲染分发测试（沿用现有 `LibraryPages.test` 风格，改断言）。
- 注意：保留 home/review-* 等既有路由可达；**不破坏**并行 D 的 `review-tasks` 等页。
- 模型：standard（触多文件，路由是全局关切）。

**T5 — 基础卡片/徽章样式 + `RuleDocCard` + `BatchCard`**
- 文件：`styles/` 加卡片/徽章 token（对齐原型）；`components/batch/RuleDocCard.tsx`（规则文件卡：图标/标题/状态色点/段·条款·规则计数/大小·时间/底部操作槽 props 注入）、`BatchCard.tsx`（批次卡）。纯展示组件，操作经 props 回调。
- 测试：给定 doc/batch props 渲染计数、状态色、loading 态;操作回调触发。
- 模型：cheap（隔离展示组件，原型即规格）。

**T6 — `BatchListPage` + `CreateBatchModal`**
- 文件：`api/batches.ts`（`listBatches/createBatch/getBatchDetail/bindRuleDocs/listBatchStandardDocs/listBatchPackages`）；`pages/batch/BatchListPage.tsx`（react-query 接 `GET /batches`，卡片网格 + 工具栏 + 新建按钮 + 虚线占位卡）；`components/batch/CreateBatchModal.tsx`（接 `POST /batches`，最小字段，成功后 invalidate + 进详情或留列表）。
- 测试：列表渲染卡片、点卡 push batch-detail、新建提交调 createBatch、batch_no 必填校验。
- 模型：standard。

**T7 — `BatchDetailPage` + `BindRuleDocsModal` + 三 Tab**
- 文件：`pages/batch/BatchDetailPage.tsx`（面包屑 + 元信息卡 + Tabs；规则库 Tab=`listBatchStandardDocs`→`RuleDocCard` 网格，「查看规则」push rule-detail；配置包 Tab=`/config-packages` 按绑定 doc_id 过滤；审查文档库 Tab=复用 `<MaterialLibrary batchId>`）；`components/batch/BindRuleDocsModal.tsx`（拉全部 `listStandardDocs` 勾选，接 `bind-rule-docs`）；`MaterialLibrary.tsx` 加可选 `batchId` prop（不传=现行为，传则调 `listBatchPackages`）。
- 测试：三 Tab 切换、规则库卡渲染与跳转、绑定弹窗勾选提交、MaterialLibrary batch 作用域。
- 模型：standard（多组件集成）。

**T8 — `RuleDetailPage`（审查规则美化）+ 去绑定列**
- 文件：`pages/batch/RuleDetailPage.tsx`（面包屑 + 头部信息 + Tabs：审查规则/依据条款）；`components/batch/DimensionRuleGroup.tsx`（维度筛选 chip + 分组）、`RuleItemCard.tsx`（规则名/判定红橙蓝徽章/处置 chip/逻辑正文/出处脚注/hover 编辑删除，复用既有 `updateRule/deleteRule`）；依据条款同构卡片复用 `updateClause/deleteClause`。从 `StandardDocLibrary` 抽出的规则编辑 Modal 逻辑迁移过来；**浏览态不再展示 binding 列**（编辑表单仍含 binding_class）。
- 注意：`StandardDocLibrary.tsx` 原一键重抽（T3 既有逻辑）迁到规则文件卡/详情页头部"重新识别并重抽规则"按钮，**send() 自动发命令逻辑零行为改动**，仅换载体。
- 测试：维度分组渲染、判定徽章配色映射、编辑/删除回调、空态文案；重抽按钮在无活动会话时提示。
- 模型：standard（含交互迁移，需谨慎）。

### 阶段三 · 材料归批次

**T9 — 上传带 batch_id**
- 文件：`materials.py` `create_review_package(db, batch_id=None)` 加参 + 兜底；上传链路把目标批次带入（前端在批次详情内发起上传时，经 Blade `send()` 命令或 shim 入参带 batch_id；具体接法在任务内确认 agent skill 现状后定）。
- 测试：带 batch_id 建包落对批次、不传落默认批次、未知 batch_id 报错。
- 模型：standard（牵动 agent 链路，需先勘察 skill/shim 现状）。

**T10 — 列表 batch 作用域收口**
- 文件：`list_batch_packages` 真正按 batch 过滤（若 T3 已实现则本任务做前端接线与回归）；确认 `BatchDetailPage` 审查文档库 Tab、计数全部按 batch 一致。
- 测试：跨批次隔离（A 批次不见 B 批次材料）。
- 模型：standard。

---

## 7. 全局约束（每个实现/审查子代理都要带）

- **后端零 LLM**：批次/绑定/材料均为结构化读写，判断仍由 agent 完成。
- 写端点 `X-API-Key`（`require_api_key`）；读端点不鉴权。
- 维度六值 `completeness/normativeness/compliance/consistency/rationality/authenticity`；判定 `hard/verify/soft`→硬性/需核验/建议(红/橙/蓝)；处置 `reject/fix/review`→驳回/补正/复核。
- 颜色 token：success `#52c41a`、primary `#1677ff`、warning `#fa8c16`、error `#ff4d4f`、neutral `#8c8c8c`（与原型一致）。
- **禁止 `git add -A`**，只 add 本任务文件；提交信息中文；文件 UTF-8 无 BOM。
- 本地 master 单分支，延续既有工作流，不推远端。
- 测试门：后端 `pytest`；前端 `npx vitest run <path>` + `npm test` + `npm run build` 全绿。
- 不碰并行 D 会话的 `src/components/review/` 与其 `progress.md` 段。
- **DB 迁移须用户执行**：`docs/file/migrations/2026-06-26-batch_rule_doc.sql` 对 `smart` 生产库跑一次，否则后端 batch 端点 500。

## 8. 验收

- 左侧菜单"项目批次"单入口；批次列表卡片可新建、可进入。
- 批次详情三 Tab 正常；绑定规则集弹窗可多选并生效；规则库卡片可进规则详情。
- 规则详情审查规则按维度分组美化、判定配色正确、可编辑删除；无浏览态绑定列。
- 审查文档库按批次隔离；查看原文件站内预览正常；一键重抽行为不变。
- 全测试 + build 绿；迁移 SQL 已交付。

## 9. 风险/待确认

- **R1 上传带 batch_id 的接法**（T9）：agent 上传链路当前固定默认批次，需先勘察 skill/shim 是否能携带 batch 上下文；若改造成本高，可降级为"批次详情内上传→后端按当前批次归属"，或本期 T9/T10 仅打通后端入参、agent 链路留后续。
- **R2 config_package Tab 过滤**：本期客户端按绑定 doc_id 过滤 `/config-packages`；若将来要真正物化配置包再议。
- **R3 与并行 D 的 master 交错**：执行期留意 `git log`，review-package BASE 取本任务实际父提交。
