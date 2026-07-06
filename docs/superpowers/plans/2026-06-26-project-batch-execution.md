# 项目批次重构 · 执行计划（作战手册）

> 配套实现计划：`docs/superpowers/plans/2026-06-26-project-batch-redesign.md`
> 原型：`docs/mockups/batch-redesign.html`
> 工作流：subagent-driven-development（每任务：实现子代理 → review-package → 审查子代理 → 修复 → 记账；末尾 opus 全分支终审 → finishing-a-development-branch）
> 本子项目独立账本：`.superpowers/sdd/progress-batch.md`（与并行"形式审查子项目D"的 `progress.md` 分开）

---

## 0. 执行原则

- **逐任务串行**：一次只派一个实现子代理；不并行实现（防文件冲突，尤其与并行 D 会话同 master）。
- **每任务三关**：实现 → 任务审查（规格符合 + 代码质量两项裁决）→ 修复（仅 Critical/Important），Minor 记账留终审 triage。
- **测试门硬性**：实现子代理必须自跑测试并回报命令+输出；审查前我用 `review-package BASE HEAD` 出 diff 文件交审查子代理。
- **BASE 取真实父提交**：因 master 上有并行 D 会话提交穿插，每次 review-package 的 BASE 用"本任务实现前我记录的 HEAD"，绝不用 `HEAD~1`。
- **模型分级**：纯展示/机械任务 cheap；多文件集成/路由/交互迁移 standard；终审 opus。
- **不碰** `src/components/review/`（并行 D 域）与其账本段。

## 1. 预备步骤（执行启动时一次性，**届时才做，现在不做**）

1. 记录 `BASE0 = 当前 master HEAD`，写入新账本 `.superpowers/sdd/progress-batch.md` 抬头。
2. 账本登记 10 任务清单 + 关键约束摘要（同实现计划 §7）。
3. 确认工作目录干净相关文件无未提交改动（mockups/计划文档已在仓库，属本轮产物，可保留）。

## 2. 执行序列与检查点

```
阶段一 后端基座      T1 → T2 → T3        ┐
                                         ├─【检查点A：后端可独立 e2e】
阶段二 前端 IA/页面  T4 → T5 → T6 → T7 → T8 ┐
                                            ├─【检查点B：浏览器走查，对照原型】
阶段三 材料归批次    〔R1 决策〕→ T9 → T10  ┐
                                            ├─【检查点C：跨批次隔离验收】
终审               opus 全分支 review → finishing-a-development-branch
```

### 阶段一 · 后端基座（T1–T3）
| 任务 | 派发模型 | 产物要点 | 测试门 |
|---|---|---|---|
| T1 | cheap | `batch_rule_doc` 建表(schema SQL+迁移SQL) + `BatchRuleDoc` 模型 + conftest 清理 + `batches.py` 绑定服务 | `pytest tests/test_batches_service.py` |
| T2 | standard | `GET/POST /batches` + schemas + `list_batches/create_batch` + 路由注册 | `pytest tests/test_batches_api.py` |
| T3 | standard | `GET /batches/{id}` 详情 + `bind-rule-docs` + 子集端点 | `pytest tests/test_batches_api.py` |

> 每个后端任务结束追加跑一次全量 `pytest`，确保未回归（含并行 D 的后端零改动假设）。

**🔶 检查点 A（阶段一完成）**——可选，交还你：
- 我交付迁移 SQL；你对 `smart` 生产库执行一次。
- 你可 `curl` / Blade 验 `GET /batches`、新建、绑定。
- 你确认无误或直接放行，我继续阶段二。

### 阶段二 · 前端 IA 与页面（T4–T8）
| 任务 | 派发模型 | 产物要点 | 测试门 |
|---|---|---|---|
| T4 | standard | `useRouteStore` 带参 nav + 面包屑 + 菜单单入口 + App 分发(占位页) | `npx vitest run` 路由/菜单用例 |
| T5 | cheap | 卡片/徽章样式 token + `RuleDocCard` / `BatchCard` 纯展示组件 | `npx vitest run` 组件用例 |
| T6 | standard | `api/batches.ts` + `BatchListPage` + `CreateBatchModal` | 同上 |
| T7 | standard | `BatchDetailPage`(三Tab) + `BindRuleDocsModal` + MaterialLibrary batch 作用域 | 同上 |
| T8 | standard | `RuleDetailPage` 审查规则维度分组美化 + 去绑定列 + 重抽按钮迁载体 | 同上 |

> 每前端任务门：`npx vitest run <本任务测试>` + `npm test` + `npm run build` 全绿。

**🔶 检查点 B（阶段二完成）**——重点，交还你：
- 启动前后端，浏览器实走：菜单→批次列表→新建/绑定→批次详情三Tab→规则卡→规则详情美化。
- 对照原型 `batch-redesign.html` 核观感；你提调整我即改。
- 放行后进阶段三。

### 阶段三 · 材料归批次（T9–T10）
**🔶 R1 决策点（T9 开工前）**——需你拍板：
> 现 agent 上传材料固定落默认批次。让新上传落指定批次有两条路：
> - **(a) 改 agent 上传链路带 batch 上下文**（skill/shim 携带 batch_id；最完整，工作量大，先勘察可行性）
> - **(b) 后端只打通 `create_review_package(batch_id)` 入参 + 批次详情内发起上传时前端经 `send()` 带 batch_id**（较轻）
> - **(c) 本期只做后端入参 + 跨批次读隔离，agent 自动归批留后续**（最小，前 8 任务的批次管理已完整可用）
> 我会带 T9 勘察结论回来再请你选；默认倾向 (c) 起步、(b) 收尾。

| 任务 | 派发模型 | 产物要点 | 测试门 |
|---|---|---|---|
| T9 | standard | `create_review_package(db, batch_id)` + 兜底 + 上传链路(按 R1 决策) | `pytest` 相关用例 |
| T10 | standard | 列表/计数按 batch_id 收口 + 前端接线 + 跨批次隔离回归 | `pytest` + `npx vitest run` |

**🔶 检查点 C**：A 批次看不到 B 批次材料；计数一致。

### 终审 & 收尾
1. `review-package BASE0 HEAD` 出全分支 diff → 派 **opus** 全分支审查，附 Minor triage 清单。
2. 终审返回的问题派**一个**修复子代理（一次带全部 findings，不一条一派）。
3. `finishing-a-development-branch`：跑全测 → 给你 4 选项（本地合并 / 推送建 PR / 保留现状 / 丢弃）。按既往惯例默认**保留本地 master 现状**，不推远端,除非你要。

## 3. 每任务派发"简报骨架"（执行时用 `scripts/task-brief` 抽取实现计划对应段，附以下要点）

- 该任务在项目中的位置（一句话）+ 实现计划对应任务段路径（作为唯一需求源）。
- 前序任务产出的接口/契约（如 T6 需 T2 的 `BatchOut` 形状、`api/batches.ts` 签名）。
- 全局约束（实现计划 §7 逐字带：零LLM、X-API-Key、维度/判定/颜色 token、禁 `git add -A`、UTF-8 无 BOM、测试命令）。
- 报告文件路径 + 报告契约（状态/commits/一行测试摘要/concerns）。
- 我对简报内歧义的预先裁决（如配置包 Tab 客户端过滤口径）。

## 4. 记账规则（`progress-batch.md`）

- 每任务审查通过即追加一行：`T<n>: complete (commits <base7>..<head7>, review clean)` + 一句产物摘要 + Minor 列表（留终审 triage）。
- 账本是恢复地图：上下文压缩后以账本 + `git log` 为准，不靠记忆重派已完成任务。

## 5. 风险与回滚

- **R1**（上传归批）：见决策点；可降级，不阻塞批次管理主体。
- **R2**（配置包过滤）：本期客户端按绑定 doc_id 过滤 `/config-packages`，不动后端配置包逻辑。
- **R3**（并行 D 交错）：每次 review BASE 取真实父提交；若某任务文件与 D 撞，暂停并向你报告。
- **回滚**：纯本地 master 逐 commit，任一任务有问题可 `git revert` 单个 commit；DB 迁移仅新增表，回滚 = `DROP TABLE batch_rule_doc`（无数据耦合到旧表）。

---

## 6. 现在的状态

- ✅ 设计讨论收敛、原型认可、实现计划 + 本执行计划已就绪。
- ⏸ **未启动任何子代理、未改任何项目代码**。
- ▶ 待你一句"开始执行"，我从预备步骤 §1 起跑 T1。
