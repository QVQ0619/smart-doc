#!/usr/bin/env python3
"""smart-doc-rules: 把结构化的审查规则 POST 入 review_rule(+version+rule_clause)。

用法: smart_doc_rules.py <doc_id> <rules.json 路径>
JSON 形如 {"rules":[{source_clause_id,dimension_code,name,logic,decision_type,disposition,binding_class}]}
环境: SMART_DOC_API(必填), SMART_DOC_TIMEOUT(默认120)
stdout: inserted=<n> skipped=<m>
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
        sys.stderr.write("用法: smart_doc_rules.py <doc_id> <rules.json>\n")
        return 1
    api_base = os.environ.get("SMART_DOC_API")
    if not api_base:
        sys.stderr.write("[smart-doc-rules] 未设置 SMART_DOC_API\n")
        return 6
    doc_id = argv[1]
    path = Path(argv[2])
    if not path.is_file():
        sys.stderr.write(f"[smart-doc-rules] 文件不存在: {path}\n")
        return 2
    timeout = int(os.environ.get("SMART_DOC_TIMEOUT", "120"))
    url = api_base.rstrip("/") + f"/api/standard-docs/{doc_id}/rules"
    headers = {"Content-Type": "application/json"}
    api_key = os.environ.get("SMART_DOC_API_KEY")
    if api_key:
        headers["X-API-Key"] = api_key
    req = urllib.request.Request(url, data=path.read_bytes(), method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"[smart-doc-rules] 后端返回 {e.code}: {e.read().decode('utf-8', 'ignore')[:300]}\n")
        return 4
    except urllib.error.URLError as e:
        sys.stderr.write(f"[smart-doc-rules] 网络错误: {e.reason}\n")
        return 3
    sys.stdout.write(f"inserted={result.get('inserted')} skipped={result.get('skipped')}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
