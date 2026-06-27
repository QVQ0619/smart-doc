# 规则文件：从批次移除 + 彻底删除 + 规则库查看 — 设计文档

> 日期：2026-06-27
> 状态：设计已确认，待写实现计划
> 原型：`docs/mockups/rule-doc-delete.html`

## 1. 背景与问题

项目批次详情页可以「绑定规则集」（绑定规则文件），但**缺少删除能力**：

- 批次详情页规则卡只有「查看规则」「原文」两个按钮，**无法把单个规则文件移出批次**。
- 后端绑定走 `POST /batches/{id}/bind-rule-docs`，是**幂等全量覆盖**，没有单个解绑端点。
- 已有的 `DELETE /standard-docs/{doc_id}` 只做**软删（is_active=False），无任何级联清理**——删了之后 `batch_rule_doc` 关联、派生的条款/规则/配置包都还在，是「假删除」，有数据不一致风险。
- 承载彻底删除按钮的规则库页（`StandardDocLibrary`）目前在左侧导航**无入口**（死代码），用户点不进去。

## 2. 概念关系（前置事实）

- **规则文件** = `StandardDoc` 表（独立文档对象）。本文「规则集 / 规则文件」均指它。
- **批次 ↔ 规则文件** = `batch_rule_doc` 关联表（N:M）。
- **配置包** = 从规则文件派生的只读规则集，无独立表，纯派生。
- 删除链硬约束：`batch_rule_doc`、`review_rule_clause`、`regulation_clause` 均为 NOT NULL + FK RESTRICT；`review_rule.current_version_id` 是循环 FK。必须严格按
  `batch_rule_doc → review_rule 全链 → regulation_clause → parse_segment → standard_doc` 顺序删除。

## 3. 设计决策（已与用户确认）

| 决策点 | 选定 |
|--------|------|
| 删除范围 | 同时支持「从批次移除（解绑）」与「彻底删除规则文件」 |
| 彻底删除语义 | **物理级联删除，不可逆** |
| 「从批次移除」位置 | 批次详情页规则卡 |
| 「彻底删除」位置 | 规则库页（`StandardDocLibrary`） |
| 规则库页可达性 | 加进左侧菜单「资源」组，与「项目批次」并列 |
| 规则库查看规则方式 | **复用批次的美化详情页 `RuleDetailPage`**（六维分组卡片 + 依据条款卡片），不再用展开行表格 |
| 解绑不存在的关联 | 返回 404（让前端能提示「已不在批次」） |
| `file_object` | 维持现有 `deleted_at` 软删（blob 清理是独立关注点，不在本次范围） |

## 4. 改动总览（4 处）

| # | 位置 | 改动 |
|---|------|------|
| ① | 批次详情页 · 规则卡 | 新增「从批次移除」按钮（仅解绑，可逆） |
| ② | 规则库页 · 操作列 | 「彻底删除」改为真·物理级联删除 + 强警示文案 |
| ③ | 左侧菜单「资源」组 | 新增「规则库」入口（含路由接线） |
| ④ | 规则库 → 查看规则 | 复用 `RuleDetailPage`，面包屑适配为「规则库 / 文件名」 |

## 5. 后端设计

### 5.1 新增：单个解绑端点（改动①后端）

文件：`backend/app/routers/batches.py` + `backend/app/batches.py`

```
DELETE /batches/{batch_id}/standard-docs/{doc_id}  → 204
```

- 新增 service `unbind_rule_doc(db, batch_id, doc_id) -> bool`：删除 `batch_rule_doc` 中匹配 `(batch_id, doc_id)` 的行，返回是否删到。
- 路由层：删到返回 204；未匹配到（关联不存在）返回 404 `detail="binding not found"`。
- 只动关联表，**不触碰** `StandardDoc` 及任何派生数据——规则文件本身、其他批次、派生条款/规则/配置包都不受影响。

### 5.2 改造：彻底删除端点（改动②后端）

文件：`backend/app/routers/standard_docs.py:209`（现为软删）

把现有「假软删」替换为真·物理级联删除，**复用现成模板**（已在 `recognition.py` / `structuring.py` 验证可用）：

```python
delete_rules_for_doc(db, doc_id)                                      # 规则全链 + 断循环 FK
db.execute(delete(RegulationClause).where(RegulationClause.standard_doc_id == doc_id))  # 条款
db.execute(delete(ParseSegment).where(ParseSegment.standard_doc_id == doc_id))          # 段落
db.execute(delete(BatchRuleDoc).where(BatchRuleDoc.standard_doc_id == doc_id))          # ← 新增：批次关联
# file_object：维持现有软删
if sd.file_id:
    fo = db.get(FileObject, sd.file_id)
    if fo: fo.deleted_at = datetime.now()
db.delete(sd)                                                          # 物理删 standard_doc
db.commit()
```

- 顺序严格遵守 FK RESTRICT 约束（先关联/派生，最后主体）。
- 404 保留：`doc_id` 不存在仍返回 404。
- `require_api_key` 依赖保留。
- ⚠️ 与原行为差异：从软删改为物理删，调用方（规则库页）语义升级为「不可恢复」。

## 6. 前端设计

### 6.1 批次详情页规则卡「从批次移除」（改动①前端）

- 文件：`src/pages/batch/BatchDetailPage.tsx`（规则卡 `actions`，约 103 行）+ `src/api/batches.ts`。
- 新增 API：`unbindRuleDoc(batchId, docId)` → `DELETE /api/batches/{batchId}/standard-docs/{docId}`。
- 规则卡 `actions` 增加「从批次移除」红色按钮 + `Popconfirm`（文案强调：仅解绑本批次、规则文件保留、其他批次不受影响）。
- 成功后 `invalidateQueries(["batch-detail", batchId])` 刷新；toast 提示。

### 6.2 规则库进菜单 + 路由（改动③前端）

- 文件：`src/layout/menuConfig.tsx` 新增 `RouteKey: "rule-library"`，在「资源」组加一项「规则库」（与「项目批次」并列）。
- 在 RouteKey → 页面 的渲染映射处接上 `RuleLibraryPage`（实现时定位该 switch/映射所在文件）。

### 6.3 规则库页删除按钮（改动②前端）

- 文件：`src/components/StandardDocLibrary.tsx:364`。
- 按钮已存在，仅把 `Popconfirm` 文案改成强警示：
  「将永久删除该规则文件及其全部条款、审查规则、配置包，并从所有批次解绑，**不可恢复**」。
- 后端改造后此按钮即真正生效。

### 6.4 规则库查看规则 → 复用美化详情页（改动④前端）

- 文件：`src/pages/batch/RuleDetailPage.tsx`、`src/store/useRouteStore.ts`（route 类型）、`src/components/StandardDocLibrary.tsx`。
- `RuleDetailPage` 的 `batchId/batchTitle` 改为**可选**（规则数据本身只靠 `docId`，不受影响）：
  - 有批次上下文：面包屑「项目批次 / 批次名 / 规则库 / 文件名」（现状不变）。
  - 无批次上下文（从规则库进入）：面包屑「规则库 / 文件名」，点「规则库」回到规则库页。
- 规则库页操作列把「查看」改为「**查看规则**」，`navigate({ name: "rule-detail", docId, docTitle })`（不带 batch 字段）。
- 决策：规则库不再保留展开行内表格预览，统一走美化详情页（与批次一致，避免两套视图）。

## 7. 测试

### 后端
- `test_unbind_rule_doc`：绑定后删一条 → 204 且 `batch_rule_doc` 只少这一条；删不存在关联 → 404；规则文件与其他批次绑定不受影响。
- 改写 `delete_standard_doc` 测试：建文档→派生 segment/clause/rule→绑定批次→DELETE→断言 `batch_rule_doc` / `regulation_clause` / `review_rule(_version/_clause)` / `parse_segment` 全空，且 `standard_doc` 行**物理消失**（非 is_active=False）；`file_object.deleted_at` 被置。

### 前端
- 批次详情页规则卡含「从批次移除」按钮，点击→Popconfirm→调 `unbindRuleDoc`→刷新。
- 菜单含「规则库」入口，点击渲染 `RuleLibraryPage`。
- 规则库行「查看规则」→ 导航到 rule-detail（无 batch）；`RuleDetailPage` 在无 batch 时面包屑为「规则库 / 文件名」。

## 8. 不做（YAGNI）

- 不物化 `config_package` 两表（仍纯派生）。
- 不做规则文件的「回收站 / 恢复」（彻底删除即物理删）。
- 不清理 blob 物理文件（`file_object` 仅软删）。
- 不动 `bind-rule-docs` 幂等全量覆盖端点（绑定路径不变）。
