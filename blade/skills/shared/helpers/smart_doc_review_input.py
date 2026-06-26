#!/usr/bin/env python3
"""smart-doc-review-input: 绑配置包 + 取审查输入。
用法: smart_doc_review_input.py <package_id> <config_doc_id>
先 POST /api/packages/{id}/bind-config{config_doc_id} 再 GET /api/packages/{id}/review-input,打印输入 JSON。
环境: SMART_DOC_API(必填), SMART_DOC_API_KEY(可选), SMART_DOC_TIMEOUT(默认120)
退出码: 0成功 1用法 3网络 4非2xx 6缺SMART_DOC_API
"""
from __future__ import annotations
import json, os, sys, urllib.error, urllib.request


def _headers(json_body=False):
    h = {}
    if json_body:
        h["Content-Type"] = "application/json"
    key = os.environ.get("SMART_DOC_API_KEY")
    if key:
        h["X-API-Key"] = key
    return h


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        sys.stderr.write("用法: smart_doc_review_input.py <package_id> <config_doc_id>\n"); return 1
    api_base = os.environ.get("SMART_DOC_API")
    if not api_base:
        sys.stderr.write("[smart-doc-review-input] 未设置 SMART_DOC_API\n"); return 6
    pkg, doc = argv[1], argv[2]
    timeout = int(os.environ.get("SMART_DOC_TIMEOUT", "120"))
    base = api_base.rstrip("/")
    bind_body = json.dumps({"config_doc_id": int(doc)}).encode()
    try:
        bind_req = urllib.request.Request(base + f"/api/packages/{pkg}/bind-config",
                                          data=bind_body, method="POST", headers=_headers(json_body=True))
        with urllib.request.urlopen(bind_req, timeout=timeout) as resp:
            bind = json.loads(resp.read().decode("utf-8"))
        in_req = urllib.request.Request(base + f"/api/packages/{pkg}/review-input",
                                        method="GET", headers=_headers())
        with urllib.request.urlopen(in_req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"[smart-doc-review-input] 后端返回 {e.code}: {e.read().decode('utf-8','ignore')[:300]}\n"); return 4
    except urllib.error.URLError as e:
        sys.stderr.write(f"[smart-doc-review-input] 网络错误: {e.reason}\n"); return 3
    sys.stderr.write(f"bound config_id={bind.get('config_id')} rule_count={bind.get('rule_count')}\n")
    sys.stdout.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
