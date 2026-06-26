#!/usr/bin/env python3
"""smart-doc-review: 提交机审 checks。
用法: smart_doc_review.py <package_id> <payload.json 路径>
payload 形如 {"checks":[{rule_version_id,initial_result,initial_disposition?,suggestion?,confidence?,severity?,evidence:[{segment_id?|field_code?|budget_item_id?,note?}]}]}
环境: SMART_DOC_API(必填), SMART_DOC_API_KEY(可选), SMART_DOC_TIMEOUT(默认120)
stdout: round_id=<n> round_no=<n> conclusion=<s> checks_written=<n> evidence_written=<n>
退出码: 0成功 1用法 2文件不存在 3网络 4非2xx 6缺SMART_DOC_API
"""
from __future__ import annotations
import json, os, sys, urllib.error, urllib.request
from pathlib import Path


def format_result(r: dict) -> str:
    return (f"round_id={r.get('round_id')} round_no={r.get('round_no')} "
            f"conclusion={r.get('conclusion')} checks_written={r.get('checks_written', 0)} "
            f"evidence_written={r.get('evidence_written', 0)}")


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        sys.stderr.write("用法: smart_doc_review.py <package_id> <payload.json>\n"); return 1
    api_base = os.environ.get("SMART_DOC_API")
    if not api_base:
        sys.stderr.write("[smart-doc-review] 未设置 SMART_DOC_API\n"); return 6
    path = Path(argv[2])
    if not path.is_file():
        sys.stderr.write(f"[smart-doc-review] 文件不存在: {path}\n"); return 2
    timeout = int(os.environ.get("SMART_DOC_TIMEOUT", "120"))
    url = api_base.rstrip("/") + f"/api/packages/{argv[1]}/review"
    headers = {"Content-Type": "application/json"}
    key = os.environ.get("SMART_DOC_API_KEY")
    if key:
        headers["X-API-Key"] = key
    req = urllib.request.Request(url, data=path.read_bytes(), method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"[smart-doc-review] 后端返回 {e.code}: {e.read().decode('utf-8','ignore')[:300]}\n"); return 4
    except urllib.error.URLError as e:
        sys.stderr.write(f"[smart-doc-review] 网络错误: {e.reason}\n"); return 3
    sys.stdout.write(format_result(result) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
