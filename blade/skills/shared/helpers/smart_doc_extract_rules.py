#!/usr/bin/env python3
"""smart-doc-extract-rules: 一步把 items(依据条款字段 + 审查规则字段) POST 入库。

后端原子处理:插 regulation_clause 拿 id → 插 review_rule+version+rule_clause(关联该 id)。
用法: smart_doc_extract_rules.py <doc_id> <items.json 路径>
JSON 形如 {"items":[{clause_no,clause_text,source_segment_id,dimension_code,name,logic,decision_type,disposition,binding_class}]}
环境: SMART_DOC_API(必填), SMART_DOC_API_KEY(可选), SMART_DOC_TIMEOUT(默认120)
stdout: clauses_inserted=<n> rules_inserted=<m> skipped=<k> missing_provenance=<p>
退出码: 0成功 1用法 2文件不存在 3网络 4非2xx 6缺SMART_DOC_API
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        sys.stderr.write("用法: smart_doc_extract_rules.py <doc_id> <items.json>\n")
        return 1
    api_base = os.environ.get("SMART_DOC_API")
    if not api_base:
        sys.stderr.write("[smart-doc-extract-rules] 未设置 SMART_DOC_API\n")
        return 6
    doc_id = argv[1]
    path = Path(argv[2])
    if not path.is_file():
        sys.stderr.write(f"[smart-doc-extract-rules] 文件不存在: {path}\n")
        return 2
    timeout = int(os.environ.get("SMART_DOC_TIMEOUT", "120"))
    url = api_base.rstrip("/") + f"/api/standard-docs/{doc_id}/extract-rules"
    headers = {"Content-Type": "application/json"}
    api_key = os.environ.get("SMART_DOC_API_KEY")
    if api_key:
        headers["X-API-Key"] = api_key
    req = urllib.request.Request(url, data=path.read_bytes(), method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"[smart-doc-extract-rules] 后端返回 {e.code}: {e.read().decode('utf-8', 'ignore')[:300]}\n")
        return 4
    except urllib.error.URLError as e:
        sys.stderr.write(f"[smart-doc-extract-rules] 网络错误: {e.reason}\n")
        return 3
    sys.stdout.write(
        f"clauses_inserted={result.get('clauses_inserted')} rules_inserted={result.get('rules_inserted')} "
        f"skipped={result.get('skipped')} missing_provenance={result.get('missing_provenance')}\n"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
