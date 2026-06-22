#!/usr/bin/env python3
"""smart-doc-segments: 解析目标文档并取其 parse_segment（供 agent 抽取规则前阅读）。

用法: smart_doc_segments.py <doc_id|doc_code|标题子串>
环境: SMART_DOC_API(必填), SMART_DOC_TIMEOUT(默认120)
stdout: 首行 doc_id=<n>，随后段落 JSON。
退出码: 0成功 1用法 3网络 4非2xx 6缺SMART_DOC_API 7标题歧义 8未找到
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def _get(url: str, timeout: int):
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def resolve_doc_id(api_base: str, ident: str, timeout: int):
    """返回 (doc_id, err)。err: None=成功；'notfound'；list=候选(歧义)。"""
    if ident.isdigit():
        return int(ident), None
    docs = _get(api_base.rstrip("/") + "/api/standard-docs", timeout)
    if ident.startswith("SD-"):
        matches = [d for d in docs if d.get("doc_code") == ident]
    else:
        matches = [d for d in docs if ident in (d.get("title") or "")]
    if not matches:
        return None, "notfound"
    if len(matches) > 1:
        return None, matches
    return matches[0]["id"], None


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        sys.stderr.write("用法: smart_doc_segments.py <doc_id|doc_code|标题>\n")
        return 1
    api_base = os.environ.get("SMART_DOC_API")
    if not api_base:
        sys.stderr.write("[smart-doc-segments] 未设置 SMART_DOC_API\n")
        return 6
    timeout = int(os.environ.get("SMART_DOC_TIMEOUT", "120"))
    try:
        doc_id, err = resolve_doc_id(api_base, argv[1], timeout)
        if err == "notfound":
            sys.stderr.write(f"[smart-doc-segments] 未找到匹配文档: {argv[1]}\n")
            return 8
        if isinstance(err, list):
            sys.stderr.write("[smart-doc-segments] 标题命中多条，请用 doc_code 指明其一:\n")
            for d in err:
                sys.stderr.write(f"  id={d.get('id')} doc_code={d.get('doc_code')} title={d.get('title')}\n")
            return 7
        segs = _get(api_base.rstrip("/") + f"/api/standard-docs/{doc_id}/segments", timeout)
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"[smart-doc-segments] 后端返回 {e.code}: {e.read().decode('utf-8', 'ignore')[:300]}\n")
        return 4
    except urllib.error.URLError as e:
        sys.stderr.write(f"[smart-doc-segments] 网络错误: {e.reason}\n")
        return 3
    sys.stdout.write(f"doc_id={doc_id}\n")
    sys.stdout.write(json.dumps(segs, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
