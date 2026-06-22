# Blade 集成产物（聊天上传规则文件入库）

本目录是「聊天里上传规则文件 → Blade agent 识别 → 入规则库」功能在本仓库内的产物，
配合部署到你的 Blade solution / agent 容器使用。设计见
`docs/superpowers/specs/2026-06-22-聊天上传规则文件入库-design.md`。

## 组成
- `skills/save_rule_doc/SKILL.md` — 教 agent 何时、怎么调 `smart-doc-add`、怎么如实回报。
- shim 源码在 `../backend/agent_shim/smart_doc_add.py`（纯标准库）。

## 部署步骤
1. **挂 shim**：把 `backend/agent_shim/smart_doc_add.py` 放进 agent 容器，暴露为 PATH 上的可执行 `smart-doc-add`。任选：
   - 文件首行已是 `#!/usr/bin/env python3`，`chmod +x` 后软链到 `/usr/local/bin/smart-doc-add`；
   - 或包一层：`/usr/local/bin/smart-doc-add` 内容为
     ```sh
     #!/usr/bin/env sh
     exec python3 /opt/smart-doc/smart_doc_add.py "$@"
     ```
2. **配环境变量**（agent 容器内）：
   - `SMART_DOC_API`：smart-doc 后端可达地址，例 `http://smart-doc-backend:8000`（同机/同网地址，**不要用 localhost**，除非 agent 与后端真正共享网络命名空间）。
   - `SMART_DOC_TIMEOUT`：可选，单次上传超时秒数，默认 120。
3. **装 skill**：把 `skills/save_rule_doc/` 按你的 solution 的 skill 格式装入。若用 `versions/<ver>/SKILL.md` 结构（如 blade-coa），相应放置；frontmatter 字段按你的平台规范调整。
4. **确认附件上传开启**：聊天用的 `<ChatView>` 原生支持附件，确保 solution 未禁用。

## 验证
见 spec 的「端到端人工验证」。
