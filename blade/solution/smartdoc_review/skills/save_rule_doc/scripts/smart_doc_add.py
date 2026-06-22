#!/usr/bin/env python3
"""smart-doc-add: 把 sandbox 里的规则文件上传到 smart-doc 后端入规则库.

纯标准库; 供 Blade agent 容器挂载为 PATH 上的可执行 `smart-doc-add` 使用.
用法: smart-doc-add <path> [<path> ...]
环境: SMART_DOC_API(必填, 后端 base URL), SMART_DOC_TIMEOUT(默认120秒)
退出码: 0全部成功 1用法错误 2文件不存在 3网络错误 4后端非2xx 5有failed项 6缺SMART_DOC_API
"""
from __future__ import annotations

import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

FIELD = "files"


def build_multipart(paths: list[str]) -> tuple[bytes, str]:
    """构造 multipart/form-data, 每个文件放在字段 'files'. 返回 (body: bytes, content_type: str)."""
    boundary = uuid.uuid4().hex
    crlf = b"\r\n"
    parts = []
    for p in paths:
        path = Path(p)
        data = path.read_bytes()
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        parts.append(b"--" + boundary.encode() + crlf)
        parts.append(
            f'Content-Disposition: form-data; name="{FIELD}"; filename="{path.name}"'.encode("utf-8")
            + crlf
        )
        parts.append(f"Content-Type: {ctype}".encode("utf-8") + crlf + crlf)
        parts.append(data + crlf)
    parts.append(b"--" + boundary.encode() + b"--" + crlf)
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def upload(api_base: str, paths: list[str], timeout: int) -> dict:
    """POST 到 {api_base}/api/standard-docs, 返回解析后的 dict.
    非2xx 抛 urllib.error.HTTPError; 连接失败抛 urllib.error.URLError."""
    body, ctype = build_multipart(paths)
    url = api_base.rstrip("/") + "/api/standard-docs"
    req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": ctype})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main(argv: list[str]) -> int:
    paths = argv[1:]
    if not paths:
        sys.stderr.write("用法: smart-doc-add <path> [<path> ...]\n")
        return 1
    api_base = os.environ.get("SMART_DOC_API")
    if not api_base:
        sys.stderr.write("[smart-doc-add] 未设置环境变量 SMART_DOC_API\n")
        return 6
    timeout = int(os.environ.get("SMART_DOC_TIMEOUT", "120"))

    for p in paths:
        if not Path(p).is_file():
            sys.stderr.write(f"[smart-doc-add] 文件不存在: {p}\n")
            return 2

    try:
        result = upload(api_base, paths, timeout)
    except urllib.error.HTTPError as e:  # 必须在 URLError 之前(HTTPError 是其子类)
        detail = e.read().decode("utf-8", "ignore")[:300]
        sys.stderr.write(f"[smart-doc-add] 后端返回 {e.code}: {detail}\n")
        return 4
    except urllib.error.URLError as e:
        sys.stderr.write(f"[smart-doc-add] 网络错误: {e.reason}\n")
        return 3
    except OSError as e:
        sys.stderr.write(f"[smart-doc-add] 文件读取失败: {e}\n")
        return 2

    for doc in result.get("uploaded", []):
        sys.stdout.write(
            f"doc_code={doc.get('doc_code')} title={doc.get('title')} file={doc.get('file_name')}\n"
        )
    failed = result.get("failed", [])
    for f in failed:
        sys.stderr.write(f"FAILED {f.get('name')}: {f.get('reason')}\n")
    return 5 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
