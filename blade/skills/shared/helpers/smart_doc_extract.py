#!/usr/bin/env python3
"""smart-doc-extract: 把结构化抽取 payload POST 入审查包(幂等替换)。
用法: smart_doc_extract.py <package_id> <payload.json 路径>
payload 形如 {"project_name":..,"members":[..],"coop_units":[..],"budget_items":[..],"attachments":[..],"fields":[..]}
环境: SMART_DOC_API(必填), SMART_DOC_API_KEY(可选), SMART_DOC_TIMEOUT(默认120)
stdout: members=<n> coop_units=<n> budget_items=<n> attachments=<n> fields=<n> skipped_fields=<n>
退出码: 0成功 1用法 2文件不存在 3网络 4非2xx 6缺SMART_DOC_API
"""
from __future__ import annotations
import json, os, sys, urllib.error, urllib.request
from pathlib import Path


def format_result(r: dict) -> str:
    return (f"members={r.get('members', 0)} coop_units={r.get('coop_units', 0)} "
            f"budget_items={r.get('budget_items', 0)} attachments={r.get('attachments', 0)} "
            f"fields={r.get('fields', 0)} skipped_fields={r.get('skipped_fields', 0)}")


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        sys.stderr.write("用法: smart_doc_extract.py <package_id> <payload.json>\n"); return 1
    api_base = os.environ.get("SMART_DOC_API")
    if not api_base:
        sys.stderr.write("[smart-doc-extract] 未设置 SMART_DOC_API\n"); return 6
    path = Path(argv[2])
    if not path.is_file():
        sys.stderr.write(f"[smart-doc-extract] 文件不存在: {path}\n"); return 2
    timeout = int(os.environ.get("SMART_DOC_TIMEOUT", "120"))
    url = api_base.rstrip("/") + f"/api/packages/{argv[1]}/extract"
    headers = {"Content-Type": "application/json"}
    key = os.environ.get("SMART_DOC_API_KEY")
    if key:
        headers["X-API-Key"] = key
    req = urllib.request.Request(url, data=path.read_bytes(), method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"[smart-doc-extract] 后端返回 {e.code}: {e.read().decode('utf-8','ignore')[:300]}\n"); return 4
    except urllib.error.URLError as e:
        sys.stderr.write(f"[smart-doc-extract] 网络错误: {e.reason}\n"); return 3
    sys.stdout.write(format_result(result) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
