# smartdoc_review — Blade v3 Solution 包（规则文件入库）

把「聊天里上传规则文件 → agent 识别 → 存入立项审查规则库」打包成可直接上传 Blade 的
v3 Solution 包。对应设计见 `docs/superpowers/specs/2026-06-22-聊天上传规则文件入库-design.md`。

## 包结构
```
smartdoc_review/
├── solution.yaml                       # id=smartdoc_review, role=rule_doc_keeper
├── roles/
│   └── rule_doc_keeper/role.yaml        # local_skills: [save_rule_doc]
└── skills/
    └── save_rule_doc/
        ├── SKILL.md                     # 指挥 agent 用 bash 跑脚本入库
        └── scripts/
            ├── smart_doc_add.py         # 纯标准库 shim（副本，规范源在 backend/agent_shim/）
            └── api_base.txt             # 后端可达地址（部署时替换占位符）
```

## 部署 3 步

### 1) 填后端地址
编辑 `skills/save_rule_doc/scripts/api_base.txt`，把占位符换成 **agent 能访问到的后端地址**
（隧道域名，例 `https://xxxx.trycloudflare.com`，**不要用 localhost**）。一行即可。

### 2) 打包
在仓库根运行：
```
powershell -ExecutionPolicy Bypass -File blade/solution/build.ps1
```
会从 `backend/agent_shim/smart_doc_add.py` 刷新包内 shim 副本，并生成
`blade/solution/smartdoc_review.zip`。

### 3) 上传
把 `smartdoc_review.zip` 传到 **`http://115.190.152.1:8020/studio/skill-editor`**
（上传即自动校验 v3 结构 + 字段；失败会逐条提示）。

## 让前端会话挂到这个 Solution / Role
本仓库前端用环境变量决定会话挂哪个 solution/role（见 `src/blade/config.ts`）。
在前端根目录 `.env` 设：
```
VITE_BLADE_SOLUTION_ID=smartdoc_review
VITE_BLADE_BIZ_ROLE_ID=rule_doc_keeper
```
保存后重启 `npm run dev`。这样右栏聊天创建的会话才会带上 `save_rule_doc` 技能。

## ID 一致性（改名时一起改）
| 位置 | 值 |
|---|---|
| `solution.yaml: id` / 目录名 | `smartdoc_review` |
| `roles/<dir>/role.yaml: id` / 目录名 | `rule_doc_keeper` |
| `skills/<dir>/SKILL.md: name` / 目录名 | `save_rule_doc` |
| 前端 `VITE_BLADE_SOLUTION_ID` | `smartdoc_review` |
| 前端 `VITE_BLADE_BIZ_ROLE_ID` | `rule_doc_keeper` |

## 端到端验证
聊天用“+”上传一个规则文件 + 说“这是规则文件” → agent 跑脚本 → 报“已存入规则库：标题（SD-xxxx）”
→ 切到规则库页 10s 内出现新行；查 `smart.standard_doc`/`file_object` 有行、后端磁盘有文件。
反例：占位符未替换/隧道未开 → agent 应如实报“后端不可达”，不谎报成功。
