# Blade 集成产物（规则文件入库 · 会话推送）

「聊天里上传规则文件 → Blade agent 识别 → 入立项审查规则库」的最终落地：**会话推送**。
设计见 `docs/superpowers/specs/2026-06-22-本地skill按会话推送入库-design.md`。

## 工作方式（无需手动部署 skill）
前端（`src/blade/sessionSkill.ts`）在创建会话成功后，自动用 SDK 的
`partnerSkillApi.uploadSessionSkill` 把本技能推送到该会话的 agent 沙箱：
- `blade/skills/save-rule-doc/SKILL.md` —— 教 agent 何时/怎么跑脚本、如实回报。
- `backend/agent_shim/smart_doc_add.py` —— 纯标准库 shim（**单一真源**，前端 `?raw` 引入其文本）。
- `scripts/api_base.txt` —— 后端地址，由前端 env `VITE_SMART_DOC_API` 注入。

agent 自动发现该会话级技能；用户用 ChatView「+」上传文件 + 说「这是规则文件」即触发入库。

## 你只需做两件事
1. **起隧道**给本地后端一个公网域名（agent 在远端，够不到 localhost）。
2. 前端 `.env` 配 `VITE_SMART_DOC_API=<隧道域名>`，重启 `npm run dev`。换域名只改这里，不动 skill。

## 端到端验证
见 spec 的「端到端人工验证」。
