---
name: extract-material-structure
display_name: 结构化抽取申请材料
description: 当用户在聊天中表达"结构化抽取这份申请材料/抽取申请人和预算/结构化这份材料"时，从已识别的审查包段落抽出成员/合作单位/预算/附件/标量字段并入库。
---

# extract-material-structure — 申请材料结构化抽取

材料须**已上传并识别**（先用 save-material-doc）。本技能随会话下发两个纯标准库脚本：
`scripts/smart_doc_pkg_segments.py`（读全包段落）与 `scripts/smart_doc_extract.py`（POST 抽取结果）。
后端地址在同目录 `scripts/api_base.txt`（前端注入），鉴权在 `scripts/api_key.txt`。

## 何时触发
用户对**某个已识别的审查包**表达结构化抽取意图，例如："结构化抽取这份申请材料""抽取申请人和经费""把这份申报书结构化"。

## 执行
1. 定位 package_id：若用户没给，先 `GET /api/material-packages`（或回看上一次 save-material-doc 返回的 package_id）。
2. 读全包段落：
   ```bash
   SCRIPT_DIR="$(dirname "$(find / -path '*extract-material-structure/scripts/smart_doc_pkg_segments.py' 2>/dev/null | head -1)")"
   API="$(cat "$SCRIPT_DIR/api_base.txt" | tr -d '\r\n')"; KEY="$(cat "$SCRIPT_DIR/api_key.txt" 2>/dev/null | tr -d '\r\n')"
   SMART_DOC_API="$API" SMART_DOC_API_KEY="$KEY" python3 "$SCRIPT_DIR/smart_doc_pkg_segments.py" <package_id>
   ```
3. 阅读段落，抽成 JSON 写到文件 `payload.json`。**每行尽量带 `source_segment_id`**（取自段落的 `id`）以保留出处。枚举值必须用下表白名单：
   - members[].member_role：`applicant` | `participant`
   - coop_units[].coop_type：`联合承研` | `合作单位`
   - budget_items[].category：`设备费` | `业务费` | `劳务费` | `间接费` | `管理费`
   - attachments[].attachment_type：`推荐信` | `导师同意函` | `知情同意书` | `伦理证明` | `聘任合同` | `标准初稿` | `技术成熟度报告` | `社科结项证书` | `其他`
   - fields[].field_code：`project_name` `project_category` `applicant_name` `applicant_unit` `total_budget` `research_period` `secrecy_level`（未知 code 会被后端跳过）
   - fields[].extraction_status（可选）：`ok` | `missing` | `uncertain`
   - 顶层可给 `project_name`（回填申报项目名）。
   payload 形如：
   ```json
   {"project_name":"某关键技术研究",
    "members":[{"member_role":"applicant","name":"张三","title":"教授","unit_name":"某所","source_segment_id":12}],
    "budget_items":[{"category":"设备费","item_name":"服务器","amount":12.5,"source_segment_id":20}],
    "attachments":[{"attachment_type":"推荐信","is_present":true}],
    "fields":[{"field_code":"total_budget","field_value":"50","source_segment_id":20}]}
   ```
4. 入库（幂等替换该包旧抽取）：
   ```bash
   SMART_DOC_API="$API" SMART_DOC_API_KEY="$KEY" python3 "$SCRIPT_DIR/smart_doc_extract.py" <package_id> payload.json
   ```

> 若 `find` 没找到脚本，如实告知"技能脚本缺失"，不要伪造结果。

## 解读结果（按退出码）
| 退出码 | 含义 | 回报 |
|---|---|---|
| 0 | 成功 | 转述 stdout：例"已抽取 成员1/预算3/附件2，标量字段5（跳过未知1）" |
| 1 | 用法错误 | 说明缺 package_id 或 payload |
| 2 | payload 文件不存在 | 说明没写出 payload.json |
| 3 | 连不上后端 | 后端暂不可达（隧道/地址），稍后重试 |
| 4 | 后端非 2xx | 入库失败（附 stderr：如 422 段落不属本包/枚举越界、404 包不存在），不要谎报成功 |
| 6 | 地址未配置 | `api_base.txt` 为空，提示前端配 `VITE_SMART_DOC_API` |

## 铁律
- 只有退出码 0 才能说"已抽取成功"，并只转述脚本实际输出的条数，绝不编造。
- 枚举值越界会被后端 422 拒绝整批——务必用白名单值。
- 不得绕过脚本直连数据库或自拼 SQL。
