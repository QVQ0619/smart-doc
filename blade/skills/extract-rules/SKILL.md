---
name: extract-rules
display_name: 一步抽取审查规则(依据条款+审查规则)
description: 当用户要求从某已识别规则文档"抽取规则/抽取审查规则/把这个文档的规则抽出来"时，一步读取段落、判定并入库——同时生成依据条款(regulation_clause)和结构化审查规则(review_rule)，无需先抽条款再单独结构化。
---

# extract-rules — 一步抽取(依据条款 + 审查规则)

本技能随会话下发两个纯标准库脚本(`scripts/smart_doc_segments.py` 读段落、
`scripts/smart_doc_extract_rules.py` 入库)，**一步**把某文档的 `parse_segment` 判定成
**依据条款 + 审查规则**(后端原子入 `regulation_clause` + `review_rule`，自动关联出处)。
后端地址在 `scripts/api_base.txt`、密钥在 `scripts/api_key.txt`(前端注入)。

## 何时触发
用户表达「抽取规则 / 抽取审查规则 / 把这个文档的规则抽出来」，并指明目标文档(书名号标题、
doc_code 或上文刚识别入库的文档)。**这一步同时产出依据条款和审查规则，不要再让用户单独"结构化"。**

## 执行步骤
1. 定位脚本与后端地址/密钥：
   ```bash
   SEG="$(find / -path '*extract-rules/scripts/smart_doc_segments.py' 2>/dev/null | head -1)"
   DIR="$(dirname "$SEG")"
   API="$(cat "$DIR/api_base.txt" | tr -d '\r\n')"
   KEY="$(cat "$DIR/api_key.txt" 2>/dev/null | tr -d '\r\n')"
   ```
2. 读取目标文档段落(参数可为 doc_id / doc_code(SD-开头) / 标题子串)：
   ```bash
   SMART_DOC_API="$API" python3 "$SEG" "<doc_id 或 doc_code 或 标题>"
   ```
   - 首行 `doc_id=<n>` 记下备用；其后是段落 JSON(每段含 id、page_no、locator、segment_type、content_text)。
   - 退出码 7(标题命中多条)：把候选 doc_code 念给用户请其指明，**不要擅自猜**。8(未找到)：告知未找到。
   - 段落为空：说明该文档**尚未识别成功**，无法抽取，**不要硬抽/编造**。
3. 逐条判定。对每条「审查规则」产出**一个 item**(条款字段 + 规则字段)：
   - `clause_no`：从文本取(如「第三条」「3.1」)，取不到用顺序兜底 `#1`、`#2`。
   - `clause_text`：该条规则的文字(取自对应段落)。
   - `source_segment_id`：**(必填)** 该条规则文字所在段落的 `id`(取自第 2 步 segments 返回的 id)。
     **每条 item 都必须填，不可留空**——留空会丢失出处，前端规则库无法显示页码/段落。
     若一段含多条规则，多条 item 可共用同一 `source_segment_id`。
   - `dimension_code`：六选一 —— `completeness`(完整) / `normativeness`(规范) / `compliance`(合规) /
     `consistency`(一致) / `rationality`(合理) / `authenticity`(真实)。
   - `decision_type`：`hard`(客观可机判的硬性红线) / `verify`(需核对材料或外部验证) / `soft`(建议性)。
   - `disposition`：`reject`(驳回) / `fix`(补正整改) / `review`(转人工复核)。
   - `binding_class`：`common`(通用) / `parameterized`(阈值随项目类型) / `specific`(仅特定项目类型)。
   - `name`：规则简名(必填，取自条款语义)。 `logic`：判定逻辑文字(可空)。
4. 把结果写成 JSON 文件并一步入库(用第 2 步首行的 doc_id)：
   ```bash
   cat > /tmp/items.json <<'JSON'
   {"items":[{"clause_no":"第一条","clause_text":"申请人应当具有高级专业技术职称。","source_segment_id":12,"dimension_code":"compliance","name":"高级职称要求","logic":null,"decision_type":"hard","disposition":"reject","binding_class":"common"}]}
   JSON
   # 上面是示例：各字段必须替换为对应条款的真实判定，切勿照抄此示例
   SMART_DOC_API="$API" SMART_DOC_API_KEY="$KEY" python3 "$DIR/smart_doc_extract_rules.py" "<doc_id>" /tmp/items.json
   ```
5. 解读返回 `clauses_inserted=<n> rules_inserted=<m> skipped=<k> missing_provenance=<p>`：
   回报「已抽取 N 条依据条款、生成 M 条审查规则」；`skipped`>0 补「其中 K 条字段非法被跳过」；
   `missing_provenance`>0 补「P 条未能定位到出处」。

## 退出码
| 码 | 含义 | 回报 |
|---|---|---|
| 0 | 成功 | 见上 |
| 1 | 用法错误 | 内部问题，说明未能执行 |
| 2 | items.json 不存在 | 内部问题，重写 JSON 再试 |
| 3 | 连不上后端 | 后端暂不可达(隧道/地址)，建议稍后重试 |
| 4 | 后端非 2xx | 入库失败(附原因)，不要声称成功 |
| 6 | 缺 SMART_DOC_API | 部署问题：api_base.txt 为空 |
| 7 | 标题歧义 | 念候选 doc_code，请用户指明 |
| 8 | 未找到文档 | 告知未找到 |

## 铁律
- **出处必填**：每个 item 必须带第 2 步段落的有效 `source_segment_id`(对应该规则文字所在段落)；
  宁可多花一步对照段落也**绝不留空**——`missing_provenance` 应为 0，>0 说明有遗漏需检查重填。
- **只转述 `smart_doc_extract_rules.py` 实际打印的条数**当作入库结果，绝不编造条数或字段。
- `skipped`/`missing_provenance` 如实回报，不隐瞒。
- 文档未识别成功(段落为空)就如实说无法抽取，不硬造规则。
- 六维与各枚举严格用上方白名单值；字段取自条款真实语义，不臆造。
- 不得绕过脚本直连数据库或自行拼 SQL；一切入库走 `smart_doc_extract_rules.py`(它内部调后端的带校验接口)。
