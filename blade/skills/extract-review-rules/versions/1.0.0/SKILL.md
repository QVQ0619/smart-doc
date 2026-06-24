---
name: extract-review-rules
display_name: 抽取审查规则到规则库
description: 当用户要求从某已识别规则文档中抽取审查规则/条款（如"抽取《申请规定》的审查规则""把这个文档的规则抽出来"）时，读取该文档的结构化段落、判定条款并带出处入库。
---

# extract-review-rules — 从规则文档抽取审查条款

本技能随会话下发两个纯标准库脚本（`scripts/smart_doc_segments.py`、`scripts/smart_doc_clauses.py`），
配合后端把某文档的 `parse_segment` 抽成 `regulation_clause`（依据条款，带出处）。后端地址在
`scripts/api_base.txt`（前端注入）。

## 何时触发
用户表达「抽取/提取某规则文档的审查规则或条款」，并指明目标文档（书名号标题、或 doc_code，
或上文刚识别入库的文档）。

## 执行步骤
1. 定位脚本与后端地址：
   ```bash
   SEG="$(find / -path '*extract-review-rules/scripts/smart_doc_segments.py' 2>/dev/null | head -1)"
   DIR="$(dirname "$SEG")"
   API="$(cat "$DIR/api_base.txt" | tr -d '\r\n')"
   KEY="$(cat "$DIR/api_key.txt" 2>/dev/null | tr -d '\r\n')"
   ```
2. 读取目标文档段落（参数可为 doc_id / doc_code（SD-开头）/ 标题子串）：
   ```bash
   SMART_DOC_API="$API" python3 "$SEG" "<doc_id 或 doc_code 或 标题>"
   ```
   - 首行 `doc_id=<n>` 记下备用；其后是段落 JSON（每段含 id、page_no、locator、segment_type、content_text）。
   - 退出码 7（标题命中多条）：把候选 doc_code 念给用户，请其指明其一，**不要擅自猜**。
   - 退出码 8（未找到）：告知未找到该文档。
   - 段落为空：说明该文档**尚未识别成功**，无法抽取，**不要硬抽/编造**。
3. 判定条款：阅读各段 `content_text`，挑出属于「审查规则/规定」的段落。为每条产出：
   - `clause_no`：从文本取（如「第三条」「3.1」）；取不到用顺序兜底 `#1`、`#2`。
   - `clause_text`：该条规则的文字。
   - `source_segment_id`：该条所依据段落的 `id`（出处，务必尽量填准）。
4. 把结果写成 JSON 文件并入库（用第 2 步首行的 doc_id）：
   ```bash
   cat > /tmp/clauses.json <<'JSON'
   {"clauses":[{"clause_no":"第一条","clause_text":"申请人应当具有高级专业技术职称。","source_segment_id":12}]}
   JSON
   # 上面是示例：clause_text 必须替换为该条真实条文（取自对应段落），切勿照抄此示例文字
   SMART_DOC_API="$API" SMART_DOC_API_KEY="$KEY" python3 "$DIR/smart_doc_clauses.py" "<doc_id>" /tmp/clauses.json
   ```
5. 解读返回 `inserted=<n> missing_provenance=<m>`：回报「已抽取并入库 N 条规则」；若 m>0 补一句
   「其中 M 条未能定位到出处」。

## 退出码（两脚本）
| 码 | 含义 | 回报 |
|---|---|---|
| 0 | 成功 | 见上 |
| 1 | 用法错误 | 内部问题，说明未能执行 |
| 2 | clauses.json 不存在 | 内部问题，重写 JSON 再试 |
| 3 | 连不上后端 | 后端暂不可达（隧道/地址），建议稍后重试 |
| 4 | 后端非 2xx | 入库失败（附原因），不要声称成功 |
| 6 | 缺 SMART_DOC_API | 部署问题：api_base.txt 为空，提示前端配 VITE_SMART_DOC_API |
| 7 | 标题歧义 | 念候选 doc_code，请用户指明 |
| 8 | 未找到文档 | 告知未找到 |

## 铁律
- **只转述 `smart_doc_clauses.py` 实际打印的 `inserted` 条数**当作入库结果，绝不编造条数或条文。
- `missing_provenance` 如实回报，不隐瞒。
- 文档未识别成功（段落为空）就如实说无法抽取，不硬造规则。
- 不得绕过脚本直连数据库或自行拼 SQL；一切入库走 `smart_doc_clauses.py`。
