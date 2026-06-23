---
name: structure-review-rules
display_name: 把审查条款结构化为规则
description: 当用户要求把某文档已抽取的审查条款结构化/升格为审查规则（如"把《申请规定》的条款结构化为规则""把这些条款升格为审查规则"）时，读取该文档的 regulation_clause、逐条判定结构化字段并带出处入库 review_rule。
---

# structure-review-rules — 把依据条款升格为结构化审查规则

本技能随会话下发两个纯标准库脚本（`scripts/smart_doc_list_clauses.py`、`scripts/smart_doc_rules.py`），
配合后端把某文档的 `regulation_clause`（子项目2 抽的条款）升格为 `review_rule`（带维度/判定类型/
处置/绑定类，关联回源条款继承出处）。后端地址在 `scripts/api_base.txt`（前端注入）。

## 何时触发
用户表达「把……条款结构化为审查规则 / 升格为规则 / 结构化某文档的规则」，并指明目标文档
（书名号标题、或 doc_code，或上文刚抽取条款的文档）。

## 执行步骤
1. 定位脚本与后端地址：
   ```bash
   LC="$(find / -path '*structure-review-rules/scripts/smart_doc_list_clauses.py' 2>/dev/null | head -1)"
   DIR="$(dirname "$LC")"
   API="$(cat "$DIR/api_base.txt" | tr -d '\r\n')"
   KEY="$(cat "$DIR/api_key.txt" 2>/dev/null | tr -d '\r\n')"
   ```
2. 读取目标文档条款（参数可为 doc_id / doc_code（SD-开头）/ 标题子串）：
   ```bash
   SMART_DOC_API="$API" python3 "$LC" "<doc_id 或 doc_code 或 标题>"
   ```
   - 首行 `doc_id=<n>` 记下备用；其后是条款 JSON（每条含 id、clause_no、clause_text、page_no、locator）。
   - 退出码 7（标题命中多条）：把候选 doc_code 念给用户，请其指明，**不要擅自猜**。
   - 退出码 8（未找到）：告知未找到该文档。
   - 条款为空：说明该文档**尚未抽取条款**，无法结构化，**不要硬升格/编造**，建议先抽取条款。
3. 逐条判定结构化字段。为每条要升格的 clause 产出：
   - `source_clause_id`：该 clause 的 `id`（出处由后端经此继承，务必填对）。
   - `dimension_code`：六选一 —— `completeness`(完整性) / `normativeness`(规范性) /
     `compliance`(合规性) / `consistency`(一致性) / `rationality`(合理性) / `authenticity`(真实性)。
   - `decision_type`：`hard`(客观可机判的硬性红线，违反即不通过，如职称/限项数) /
     `verify`(需核对材料或外部验证才能判，如真实性/签字函件) / `soft`(建议性，不阻断)。
   - `disposition`：`reject`(驳回) / `fix`(补正整改) / `review`(转人工复核)。
   - `binding_class`：`common`(通用) / `parameterized`(阈值随项目类型) / `specific`(仅特定项目类型)。
   - `name`：规则简名（必填，取自条款语义，如"同年限申请1项同类型"）。
   - `logic`：判定逻辑文字（可空）。
4. 把结果写成 JSON 文件并入库（用第 2 步首行的 doc_id）：
   ```bash
   cat > /tmp/rules.json <<'JSON'
   {"rules":[{"source_clause_id":9,"dimension_code":"compliance","name":"同年限申请1项同类型","logic":"同类型项目同年限1项","decision_type":"hard","disposition":"reject","binding_class":"common"}]}
   JSON
   # 上面是示例：各字段必须替换为对应条款的真实判定，切勿照抄示例
   SMART_DOC_API="$API" SMART_DOC_API_KEY="$KEY" python3 "$DIR/smart_doc_rules.py" "<doc_id>" /tmp/rules.json
   ```
5. 解读返回 `inserted=<n> skipped=<m>`：回报「已结构化并入库 N 条规则」；若 m>0 补一句
   「其中 M 条因字段非法被跳过」。

## 退出码（两脚本）
| 码 | 含义 | 回报 |
|---|---|---|
| 0 | 成功 | 见上 |
| 1 | 用法错误 | 内部问题，说明未能执行 |
| 2 | rules.json 不存在 | 内部问题，重写 JSON 再试 |
| 3 | 连不上后端 | 后端暂不可达（隧道/地址），建议稍后重试 |
| 4 | 后端非 2xx | 入库失败（附原因），不要声称成功 |
| 6 | 缺 SMART_DOC_API | 部署问题：api_base.txt 为空，提示前端配 VITE_SMART_DOC_API |
| 7 | 标题歧义 | 念候选 doc_code，请用户指明 |
| 8 | 未找到文档 | 告知未找到 |

## 铁律
- **只转述 `smart_doc_rules.py` 实际打印的 `inserted` 条数**当作入库结果，绝不编造条数或字段。
- `skipped` 如实回报，不隐瞒。
- 文档尚未抽取条款（条款为空）就如实说无法结构化，建议先抽取，不硬升格。
- 字段取自条款真实语义，不臆造；六维与各枚举严格用上方白名单值。
- 不得绕过脚本直连数据库或自行拼 SQL；一切入库走 `smart_doc_rules.py`。

## scripts/api_base.txt
后端地址（前端注入）。
