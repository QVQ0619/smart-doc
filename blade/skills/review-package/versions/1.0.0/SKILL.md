---
name: review-package
display_name: 形式审查申报包
description: 当用户表达"形式审查/审查这个申报包"(可指定规则文件)时,依 hard 规则逐条机审申请材料,输出结论/依据/出处/建议并入库。
---

# review-package — 形式审查申报包

申报包须**已结构化抽取**(先 extract-material-structure)。本技能随会话下发两个纯标准库脚本:
`scripts/smart_doc_review_input.py`(绑配置包+取审查输入)与 `scripts/smart_doc_review.py`(提交机审结果)。
后端地址在同目录 `scripts/api_base.txt`,鉴权 `scripts/api_key.txt`(前端注入)。

## 何时触发
用户对某审查包表达形式审查意图,例如"形式审查这个申报包""用《XX规则》审一下"。

## 执行
1. 选规则文件(配置包):`GET /api/config-packages` 列出可用配置包(每个=一个规则文件 doc_id),按用户意图选一个 config_doc_id;用户没指定且只有一个就用它,多个则询问。
2. 绑配置 + 取输入:
   ```bash
   SCRIPT_DIR="$(dirname "$(find / -path '*review-package/scripts/smart_doc_review_input.py' 2>/dev/null | head -1)")"
   API="$(cat "$SCRIPT_DIR/api_base.txt" | tr -d '\r\n')"; KEY="$(cat "$SCRIPT_DIR/api_key.txt" 2>/dev/null | tr -d '\r\n')"
   SMART_DOC_API="$API" SMART_DOC_API_KEY="$KEY" python3 "$SCRIPT_DIR/smart_doc_review_input.py" <package_id> <config_doc_id>
   ```
   stdout 是审查输入 JSON:`rules`(待判 hard 规则:rule_version_id/name/logic/dimension/disposition/依据条款) + 申请材料的结构化数据(members/budget_items/attachments/fields) + segments。
3. **逐条 hard 规则判四要素**,组装 `payload.json`:
   - `initial_result` ∈ `pass`|`fail`|`need_review`|`not_applicable`|`error`(满足=pass,违反=fail,无法判定=need_review,不适用=not_applicable)。
   - `initial_disposition`(可选,缺省用规则自带 disposition) ∈ `reject`|`fix`|`review`。
   - `suggestion`:整改建议(建议要素)。
   - `evidence`:出处,数组,每项给 `segment_id`(取自 segments 的段落 id)或 `field_code`(标量字段)或 `budget_item_id`(预算行)之一 + 可选 `note`。
   - 每条对应一个 `rule_version_id`(取自 rules)。
   payload 形如:
   ```json
   {"checks":[{"rule_version_id":12,"initial_result":"fail","initial_disposition":"reject",
               "suggestion":"申请书缺申请人签字","evidence":[{"segment_id":34,"note":"第2页"}]}]}
   ```
4. 提交:
   ```bash
   SMART_DOC_API="$API" SMART_DOC_API_KEY="$KEY" python3 "$SCRIPT_DIR/smart_doc_review.py" <package_id> payload.json
   ```

> 若 find 没找到脚本,如实告知"技能脚本缺失",不要伪造结果。

## 解读结果(按退出码)
| 退出码 | 含义 | 回报 |
|---|---|---|
| 0 | 成功 | 转述 stdout:例"审查完成,结论 reject,写入 5 条审查项 7 条证据" |
| 1 | 用法错误 | 缺 package_id/config_doc_id 或 payload |
| 2 | payload 文件不存在 | 没写出 payload.json |
| 3 | 连不上后端 | 隧道/地址问题,稍后重试 |
| 4 | 后端非 2xx | 失败(附 stderr:如 422 规则不属配置包/evidence不属本包、404 包不存在),不要谎报成功 |
| 6 | 地址未配置 | 提示前端配 VITE_SMART_DOC_API |

## 铁律
- 只有退出码 0 才能说"审查完成",只转述脚本实际输出的结论与计数,绝不编造。
- 枚举值越界会被后端 422 拒绝整批——务必用白名单值。
- 不得绕过脚本直连数据库或自拼 SQL。
