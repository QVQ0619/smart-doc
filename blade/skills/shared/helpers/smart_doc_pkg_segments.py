#!/usr/bin/env python3
"""smart-doc-pkg-segments: GET /api/packages/{id}/segments，把全包段落打印为 JSON。
用法: smart_doc_pkg_segments.py <package_id>
环境: SMART_DOC_API(必填), SMART_DOC_API_KEY(可选), SMART_DOC_TIMEOUT(默认120)
退出码: 0成功 1用法 3网络 4非2xx 6缺SMART_DOC_API
"""
from __future__ import annotations
import json, os, sys, urllib.error, urllib.request


def _headers():
    h = {}
    key = os.environ.get("SMART_DOC_API_KEY")
    if key:
        h["X-API-Key"] = key
    return h


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        sys.stderr.write("用法: smart_doc_pkg_segments.py <package_id>\n"); return 1
    api_base = os.environ.get("SMART_DOC_API")
    if not api_base:
        sys.stderr.write("[smart-doc-pkg-segments] 未设置 SMART_DOC_API\n"); return 6
    timeout = int(os.environ.get("SMART_DOC_TIMEOUT", "120"))
    url = api_base.rstrip("/") + f"/api/packages/{argv[1]}/segments"
    req = urllib.request.Request(url, method="GET", headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"[smart-doc-pkg-segments] 后端返回 {e.code}: {e.read().decode('utf-8','ignore')[:300]}\n"); return 4
    except urllib.error.URLError as e:
        sys.stderr.write(f"[smart-doc-pkg-segments] 网络错误: {e.reason}\n"); return 3
    sys.stdout.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
