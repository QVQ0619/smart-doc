# 形式审查结果页 P0+P1 改进设计

- 日期：2026-06-26
- 范围：P0（结果页工作台骨架重构）+ P1（发现卡片增强 + 双抽屉）
- 不含：P2（审查报告 / 工作台概览 / 多轮对比）
- 落地方式：原地重构替换现有 `src/components/ReviewPanel.tsx` 展开行内容
- 实现风格：antd 为主（Collapse / Drawer / Progress / Tag 等）+ 关键表现处少量自定义 CSS
- 后端：**零改动**

## 1. 背景

现状 `ReviewPanel.tsx`：外层一个 antd Table 列出申报包，点击展开行后内层是一个扁平 Table（规则 / 维度 / 初判 / 终判 / 建议 / 出处 / 确认 / 改判），改判走一个简单 Modal（下拉 + 意见），出处仅纯文本 `段落#x / 字段:x / 预算#x`。

三张设计演示页（`design-demo/formal-review-p0.html` / `p1.html` / `p2.html`）给出了递进的目标设计。本设计落地其中 P0、P1 两个阶段。

关键事实：后端 `GET /packages/{id}/review` 返回的 `ReviewCheck` **已经携带** `confidence`、`severity`、`evidence`（含 `segment_id` / `field_code` / `budget_item_id`），但现状前端完全没用上。因此 P0+P1 可做成纯前端改造。

## 2. 目标

### P0 —— 结果页工作台骨架
1. **结论横幅**：顶部按 `round.conclusion` 着色的 banner（建议不予立项 / 需整改 / 通过 / 待定）+ 通过/不通过/待复核/不适用 计数 + 复核进度条。
2. **统计卡**：4 张卡（通过 / 不通过 / 待复核 / 不适用），点击按结果筛选，再次点击取消。
3. **维度分组**：按 `dimension_code` 分组折叠；有问题的组排前并展开，全通过的组沉底并默认折叠；每组提供「确认本组通过项」批量确认。
4. **发现卡片**：替代表格行——状态色条 + 规则名 + 机审判定胶囊 + 建议 + 出处链 + 确认/改判。

### P1 —— 复核增强
5. 发现卡片显示 **置信度**（`confidence`）+ **严重度**（`severity`），低置信度加「⚠ 建议人工」标记。
6. **出处抽屉**：点出处 → 右侧 Drawer 显示原文并高亮（关联规则 + 机审判定）。
7. **改判抽屉**：点改判 → 右侧 Drawer 表单（依据条款 + 三选一改判 + 必填处置意见），替代现有 Modal。
8. 改判后卡片变「机审 ✕ → 人工 ✓」**箭头链** + 复核人/时间留痕。

## 3. 数据层（仅前端）

| 需要的数据 | 来源 | 现状 |
|---|---|---|
| 结论 / 计数 / 规则项 / confidence / severity / evidence | `getPackageReview`（`src/api/review.ts`） | ✅ 已返回，前端未用 |
| 出处 `segment_id` → 段落原文 | 后端 `GET /packages/{id}/segments` | ⚠️ 前端缺客户端，**需新增 `getPackageSegments(packageId)`** |
| 出处 `field_code` → 字段值 | `getPackageStructured().fields`（已有 `field_code` / `field_value`） | ✅ 已有 |
| 出处 `budget_item_id` → 预算项 | `getPackageStructured().budget_items`（已有 `id` / `item_name` / `amount`） | ✅ 已有 |
| 确认 / 改判提交 | `postReviewAction` | ✅ 已有 |

唯一新增数据层工作：在 `src/api/materials.ts`（或 `review.ts`）加一个 `getPackageSegments(packageId)` 客户端，调用已存在的后端端点 `/packages/{id}/segments`，返回所有段落，前端构建 `Map<segment_id, content_text>` 供出处抽屉用。

**降级项**：后端 `ReviewCheck` 不带「依据条款」全文。P1 改判抽屉的「依据条款」区降级显示规则名 + 建议（`suggestion`），并在 spec 标注为后续可选的小补端点，不阻塞本期。

## 4. 维度映射（重要设计决策）

后端真实 `dimension_code` 是**六维**（见 `backend/app/dimensions.py`）：

| code | 中文 |
|---|---|
| completeness | 完整性 |
| normativeness | 规范性 |
| compliance | 合规性 |
| consistency | 一致性 |
| rationality | 合理性 |
| authenticity | 真实性 |

演示页里的分组标签（申请人资格 / 预算 / 合作单位 / 附件材料）是**材料类别，不是审查维度**。

**决策**：真实分组按 `dimension_code` 走六维，前端维护一份 code→中文 映射常量。最终组名为六维，与演示 mockup 的标签不同——这是预期差异，不是缺陷。未知 code 回退显示原始 code。

## 5. 组件拆分

关注点隔离，避免 `ReviewPanel` 变巨石。新增文件均放 `src/components/review/`：

```
src/components/ReviewPanel.tsx          外层包列表（基本不动）
src/components/review/
  ReviewWorkbench.tsx     替代现 PackageReviewView：取数 + 筛选/进度状态，组织子件
  VerdictBanner.tsx       P0① 结论横幅 + 计数 + 进度条
  StatCards.tsx           P0② 4 统计卡，点击筛选
  DimensionGroup.tsx      P0③ 维度分组（antd Collapse）+ 组级「确认本组通过项」
  FindingCard.tsx         P0④ / P1① 发现卡片（色条 + 判定胶囊 + 置信度 + 严重度 + 出处链 + 操作 + 改判后箭头链）
  EvidenceDrawer.tsx      P1② 出处原文抽屉
  OverruleDrawer.tsx      P1③ 改判抽屉（替代现有 Modal）
  review-grouping.ts      纯函数：按 dimension_code 分组、排序（问题组前置）、计数、维度映射
  review-constants.ts     CONCLUSION / RESULT / DIMENSION_LABELS 等常量（从 ReviewPanel 抽出复用）
```

### 各单元职责与接口
- **review-grouping.ts**：输入 `ReviewCheck[]`，输出 `{ groups: DimensionGroupData[], counts: {pass,fail,need_review,not_applicable}, dimensionLabel(code) }`。纯函数、可单测、不依赖 React。排序规则：含 fail/need_review 的组在前且 `expanded=true`；全通过组在后且 `expanded=false`。
- **VerdictBanner**：props = `{ conclusion, counts, reviewed, total }`，纯展示。
- **StatCards**：props = `{ counts, active, onToggle }`，受控筛选。
- **DimensionGroup**：props = `{ group, filter, onConfirm, onConfirmGroup, onEvidence, onOverrule }`，渲染一组发现卡片。
- **FindingCard**：props = `{ check, onConfirm, onEvidence, onOverrule }`，渲染单条；按 `effective_result` / `final_result` 决定色条与是否显示箭头链。
- **EvidenceDrawer**：props = `{ open, check, segmentMap, structured, onClose }`，按 evidence 各项拼原文（可多条并列）。
- **OverruleDrawer**：props = `{ open, check, onClose, onSubmit }`，三选一 + 必填意见，提交走 `postReviewAction(action:"overrule")`。

### 实现风格落点
- antd 打底：`Collapse`（维度分组）、`Drawer`（双抽屉）、`Progress`（进度条）、`Tag`/`Badge`、`Radio.Group`（改判三选一）、`Input.TextArea`。
- 自定义 CSS 仅用于还原演示观感的三处：结论横幅左色条、发现卡片状态色条、机审判定胶囊配色。颜色沿用演示页 token（success #52c41a / warning #faad14 / error #ff4d4f / neutral #8c8c8c）。

## 6. 分阶段交付

- **阶段 P0**：`getPackageSegments` 暂不需要；接通 `getPackageReview` → review-grouping → VerdictBanner + StatCards + DimensionGroup + FindingCard（不含抽屉；改判暂留现有 Modal，确认走现有 `postReviewAction`）。落地即见工作台骨架。
- **阶段 P1**：FindingCard 加 confidence/severity/低置信标记；新增 `getPackageSegments`；EvidenceDrawer；OverruleDrawer 替换 Modal + 箭头链留痕。

## 7. 交互与状态

- 筛选 `active: ResultKey | null` 提升到 ReviewWorkbench；筛选时隐藏不匹配卡片，整组无可见项则隐藏该组，被筛中的组自动展开（对齐演示 JS 行为）。
- 复核进度 `reviewed/total` 来自 checks 中 `status` 已复核计数（不再用演示里的本地假计数），确认/改判成功后靠 react-query `invalidateQueries` 刷新重算。
- 改判乐观锁沿用现有 `version` 字段与 409 处理（「数据已变更，请刷新后重试」）。

## 8. 测试（TDD）

- `review-grouping.test.ts`：分组 / 问题组前置排序 / 计数 / 维度映射 / 未知 code 回退。纯函数，先写。
- 更新 `ReviewPanel.test.tsx`（或拆分到组件级测试）：
  - 渲染结论横幅与四项计数。
  - 点统计卡触发筛选、再次点取消。
  - 点确认触发 `postReviewAction(confirm)` mutation。
  - 点改判打开 OverruleDrawer，未填必填项不提交，填后触发 `overrule` mutation。
  - 点出处打开 EvidenceDrawer 并显示原文。
  - 保留现有断言契约，避免回归丢失。

## 9. 风险

1. **维度分组标签差异**：组名为六维，与演示 mockup 标签不同（已在 §4 决策说明，预期行为）。
2. **evidence 多类并存**：一条规则可能同时有 segment + field 出处，抽屉需列多条而非取首条。
3. **依据条款降级**：改判抽屉「依据条款」无后端全文，降级显示规则名 + 建议（§3）。
4. **现有测试改动面**：`ReviewPanel.test.tsx` 改动较大，需保留既有契约断言。
5. **进度口径**：从演示的本地假计数改为基于 `status` 真实计数，需确认 `CheckOut.status` 的「已复核」取值口径。

## 10. 验收标准

- 展开任一已审查申报包，见结论横幅 + 四统计卡 + 按六维分组的发现卡片，问题组在前展开、全通过组沉底折叠。
- 统计卡可筛选；组级「确认本组通过项」可批量确认。
- 发现卡片显示置信度与严重度，低置信有标记。
- 点出处弹原文高亮抽屉；点改判弹表单抽屉，必填校验生效，改判后卡片显示机审→人工箭头链与留痕。
- 前端测试与构建通过；后端无改动。
