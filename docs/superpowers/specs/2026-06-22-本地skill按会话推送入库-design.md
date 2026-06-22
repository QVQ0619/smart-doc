# 本地 skill 按会话推送入库（uploadSessionSkill）Design

> 立项审查 AI 辅助系统子功能。承接「聊天上传规则文件入库」需求，最终落地路线。
> 前序：前端骨架、文件存储后端 v2、save_rule_doc(shim+SKILL.md)、P-B(已回退)。

## Overview

`save-rule-doc` 技能的源文件留在本仓库（本地开发、版本随代码）。前端在**创建会话后**用
SDK 的 `partnerSkillApi.uploadSessionSkill` 把该技能（SKILL.md + 脚本 + 后端地址）推送到**那个
会话**的远端 agent 沙箱。agent 自动发现并加载它；用户用 ChatView 原生「+」上传文件 + 在聊天里说
「这是规则文件」时，agent 跑随技能下发的脚本，经隧道把文件 multipart 上传到本地后端入规则库。

## Goal

在「远程托管 agent、不能自托镜像」的现实下，做到 **skill 在本地开发、调用 agent 时自动带上、无需
手动在平台 studio 上传**。后端零改动；唯一的部署动作是配 `VITE_SMART_DOC_API` + 起隧道。

## 为什么是这条路（约束沿革）

- agent 在远端（`115.190.152.1`），**够不到本机磁盘与 localhost 后端**——所以 skill 必须被「送」到
  agent 沙箱，后端必须经隧道暴露。
- 否决「自托 agent 就地读本地 skill」：拿不到 agent 镜像。
- 否决「studio 手动上传 v3 Solution 包」：要手动、且改动/换隧道域名要重传。
- 选 **`uploadSessionSkill` 按会话推送**：skill 源在仓库、推送自动化、后端地址可由前端 env 注入
  （换域名不动 skill）。

## 已实测确认（spike，2026-06-22）

1. agent **会自动发现并加载**会话级 `uploadSessionSkill` 推上去的 skill（推一个 ping 探针 skill，
   发 `PING-SKILL`，agent 原样回了 `PONG-FROM-SESSION-SKILL`）。
2. 技能名必须匹配 `^[a-z0-9-]+/[a-z0-9-]+$`（连字符；故用 `local/save-rule-doc`，不能用下划线）。
3. `uploadSessionSkill(sessionId, { name, files:[{path,content}] })` → 返回
   `{ name, skill_dir, file_count, overwritten }`。

## 既有能力（复用，不改）

- 后端 `POST /api/standard-docs`（multipart，字段 `files`）→ `file_object`+`standard_doc`。**不改**。
- 后端监听 `0.0.0.0`（`SMART_HOST`/`run.py`，已完成）。
- 隧道（cloudflared，已验证）给后端公网域名。
- 脚本 `backend/agent_shim/smart_doc_add.py`（纯标准库 shim，已测；退出码 0/1/2/3/4/5/6 语义）——
  **单一真源，不改**；前端 `?raw` 引入其文本。
- `ChatPanel`（`src/layout/ChatPanel.tsx`）：`doCreateSession` 建会话拿 `sessionId`，渲染 `<ChatView>`。
- SDK：`@blade-hq/agent-kit/react` 导出 `partnerSkillApi.uploadSessionSkill(sessionId, payload)`。

## 架构与组件

| 组件 | 位置 | 职责 | 状态 |
|------|------|------|------|
| 入库接口 | 后端 `POST /api/standard-docs` | 写库 | 已存在，不改 |
| shim 脚本 | `backend/agent_shim/smart_doc_add.py` | 读 sandbox 文件→multipart POST 后端 | 已存在，不改（单一真源） |
| **会话推送 SKILL.md** | `blade/skills/save-rule-doc/SKILL.md` | 教 agent 何时/怎么定位并跑脚本、如实回报 | **新建**（连字符名） |
| **推送模块** | `src/blade/sessionSkill.ts` | `pushRuleDocSkill(sessionId)`：组装 files 调 `uploadSessionSkill` | **新建** |
| ChatPanel 接入 | `src/layout/ChatPanel.tsx` | 建会话成功后 best-effort 推送 | **小改** |
| 规则库页轮询 | `StandardDocLibrary` | 入库后自动出现新行 | 已存在，不改 |

## 数据流

```
前端 doCreateSession 成功 → sessionId
   └─ pushRuleDocSkill(sessionId)：uploadSessionSkill(sessionId, {
        name: "local/save-rule-doc",
        files: [ SKILL.md, scripts/smart_doc_add.py, scripts/api_base.txt(=VITE_SMART_DOC_API) ]
      })  → 远端会话沙箱写出技能（best-effort，失败只 toast 不挡聊天）
            ▼
用户用「+」传 政策A.pdf → 聊天说「这是规则文件」
            ▼
agent 发现 save-rule-doc 技能 → bash 定位脚本 → 读 api_base.txt → SMART_DOC_API=<隧道域名> python3 脚本 <文件>
            ▼
脚本经隧道 POST 本地后端 /api/standard-docs → file_object+standard_doc + 磁盘
            ▼
agent 据退出码回报「已存入规则库：政策A（SD-xxxx）」；规则库页 10s 轮询出现新行
```

## 组件设计

### 1. 会话推送 SKILL.md（`blade/skills/save-rule-doc/SKILL.md`）

- frontmatter：`name: save-rule-doc`（连字符）、`description`（含触发词「这是规则文件/存为规则文件/
  加入规则库」）。
- 执行：用 bash `find` 定位随技能下发的 `scripts/smart_doc_add.py`，读同目录 `scripts/api_base.txt`
  （`tr -d '\r\n'` 去 CR/LF）作为 `SMART_DOC_API` 内联，`python3` 跑脚本，传 sandbox 文件绝对路径。
- 退出码表（0/1/2/3/4/5/6）+ 铁律（仅退出码 0 且有 `doc_code=` 才算成功，绝不谎报；不绕过脚本直连库）。
- 内容基于既有 `blade/solution/.../save_rule_doc/SKILL.md`（删除前作为蓝本）。

### 2. 推送模块（`src/blade/sessionSkill.ts`）

- 用 Vite `?raw` 引入两份文本：
  - `blade/skills/save-rule-doc/SKILL.md`；
  - `backend/agent_shim/smart_doc_add.py`。
- `getSmartDocApi(): string | undefined` 读 `import.meta.env.VITE_SMART_DOC_API`（trim，空→undefined）。
- `pushRuleDocSkill(sessionId: string): Promise<void>`：
  1. 读 `VITE_SMART_DOC_API`；未配置 → `toast.warning("未配置 VITE_SMART_DOC_API，agent 入库会失败")`，
     仍继续推（api_base.txt 写空串，脚本将以退出码 6 如实报错）。
  2. `await partnerSkillApi.uploadSessionSkill(sessionId, { name:"local/save-rule-doc", files:[
     {path:"SKILL.md",content:SKILL_MD}, {path:"scripts/smart_doc_add.py",content:SHIM_PY},
     {path:"scripts/api_base.txt",content:apiBase ?? ""} ] })`。
  3. 成功 → `console.info` 记 `skill_dir`（调试用）；失败 → `toast.warning("规则文件技能推送失败：…")`。
- **解耦**：本函数任何失败都不得抛给调用方阻断会话/聊天（内部 try/catch）。

### 3. ChatPanel 接入（`src/layout/ChatPanel.tsx`）

- `doCreateSession` 成功 `setSessionId(result.session_id)` 后，`void pushRuleDocSkill(result.session_id)`
  （不 await 进关键路径、不挡 UI；新建会话按钮同样触发）。
- 不改变现有渲染分支（仍 `<ChatView sessionId={sessionId} />`）。

### 4. 后端 / 部署

- 后端不改。部署动作只剩：前端 `.env` 配 `VITE_SMART_DOC_API=<隧道域名>` + 保持隧道运行。
- 换隧道域名：改 `.env` 重启 `npm run dev` 即可，**不动 skill、不重传**。

## 错误处理 / 韧性

- 推送失败（网络/会话无效/名字非法）→ toast 警告，聊天照常（只是该会话没有入库技能）。
- `VITE_SMART_DOC_API` 缺失 → 推送时 toast 提示；脚本侧最终以退出码 6 如实报错。
- 隧道未开/域名错 → 脚本退出码 3，agent 如实报「后端不可达」，不谎报。
- 入库本身的失败（超限等）→ 仍由后端 `failed[]` + 脚本退出码 5 表达，agent 逐项如实回报。

## 测试

- 新增 `src/blade/sessionSkill.test.ts`（vitest；无 JSX 故 `.ts`；`?raw` 导入经 Vite transform 在
  vitest 下同样可用，导入路径均在 repo 根内默认 `server.fs.allow` 覆盖）：mock
  `@blade-hq/agent-kit/react` 的 `partnerSkillApi.uploadSessionSkill`、`sonner` 的 `toast`，
  用 `vi.stubEnv("VITE_SMART_DOC_API", …)` 控制 env：
  - ① 配了 `VITE_SMART_DOC_API` → `uploadSessionSkill` 以 `name:"local/save-rule-doc"` 且 files 含
    三项（SKILL.md / scripts/smart_doc_add.py / scripts/api_base.txt 内容=该 env）被调；
  - ② 未配 env → toast.warning 且 api_base.txt 内容为空串，仍调用；
  - ③ `uploadSessionSkill` reject → `pushRuleDocSkill` **不抛**、toast.warning。
- `src/layout/ChatPanel.test.tsx`：mock 推送模块（`vi.mock("../blade/sessionSkill")`），断言建会话成功后
  `pushRuleDocSkill` 以 `"s-123"` 被调；现有 4 测试不回归（共 5）。
- 后端零改动，后端 22 测试不受影响。

## 清理（本次一并做）

- 删除 `blade/solution/`（studio v3 包 + build.ps1 + README + .gitignore）。
- 删除旧 `blade/skills/save_rule_doc/`（下划线、studio 取向，被 `blade/skills/save-rule-doc/` 取代）。
- 更新 `blade/README.md`：描述「会话推送」为唯一路径，部署=配 `VITE_SMART_DOC_API`+起隧道。
- `.tools/`（cloudflared 二进制）已 gitignore，不入库。

## 范围边界

- 全部在本仓库前端 + 一份 SKILL.md；后端不改；脚本不改。
- 不引入「客户端工具执行」「公网暴露+鉴权」等（见 YAGNI）。

## 端到端人工验证（需有效 token + 隧道 + 真实 smart 库）

1. `.env` 配 `VITE_BLADE_TOKEN`、`VITE_SMART_DOC_API=<隧道域名>`；起后端（`run.py`）+ 隧道 + 前端。
2. 右栏会话就绪（前端已自动推送 save-rule-doc 技能到该会话）。
3. ChatView「+」传 `政策A.pdf` → 聊天发「这是规则文件」。
4. agent 跑脚本 → 回「已存入规则库：政策A（SD-xxxx）」→ 规则库页 10s 内出现新行；查 smart 库/磁盘。
5. 反例：隧道未开 → agent 如实报「后端不可达」，不谎报。

## 验收标准

1. ✅ 建会话成功后前端自动 `uploadSessionSkill` 推 `local/save-rule-doc`（含 SKILL.md+脚本+api_base）。
2. ✅ agent 自动发现该技能；用户传文件+说「这是规则文件」→ 经隧道入本地规则库 → 规则库页出现新行。
3. ✅ 后端地址由 `VITE_SMART_DOC_API` 注入；换隧道域名只改 `.env` 重启，不动 skill。
4. ✅ 解耦：推送失败/env 缺失不阻断聊天；脚本失败 agent 如实回报不谎报。
5. ✅ 删除 studio 包与旧下划线 skill；现有前端 27 不回归 + 新增测试全绿；后端零改动。

## Out of Scope / YAGNI

- studio 手动上传 / 持久平台 skill（已选会话推送替代）。
- 自托 agent / 公网暴露后端的鉴权方案（后者仅作安全建议，非本期）。
- 内容提取/结构化（只存原文件）。
- 钩 ChatView 原生附件取字节（用 agent 沙箱里的脚本读 sandbox 文件，不碰 SDK 内部）。
- 申请材料经聊天入库；聊天里删除/管理规则文件（仍走规则库页）。
