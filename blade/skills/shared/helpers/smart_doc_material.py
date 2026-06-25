#!/usr/bin/env python3
"""smart-doc-material: 把 sandbox 里的申请材料上传到 smart-doc 后端入审查包并识别。

用法: smart-doc-material [--package <package_id>] <path> [<path> ...]
环境: SMART_DOC_API(必填), SMART_DOC_API_KEY(可选), SMART_DOC_TIMEOUT(默认120秒)
stdout: 每文件一行 `package_id=.. material_file_id=.. file=..`；识别完成补 `recognition=<状态> segments=<段数>`
退出码: 0成功 1用法 2文件不存在 3网络 4后端非2xx 5有failed 6缺SMART_DOC_API
"""
from __future__ import annotations
import json, mimetypes, os, sys, time, urllib.error, urllib.request, uuid
from pathlib import Path

FIELD = "files"


def build_multipart(paths: list[str], package_id: str | None = None) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    crlf = b"\r\n"; parts = []
    if package_id:
        parts.append(b"--" + boundary.encode() + crlf)
        parts.append(b'Content-Disposition: form-data; name="package_id"' + crlf + crlf)
        parts.append(package_id.encode() + crlf)
    for p in paths:
        path = Path(p); data = path.read_bytes()
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        parts.append(b"--" + boundary.encode() + crlf)
        parts.append(f'Content-Disposition: form-data; name="{FIELD}"; filename="{path.name}"'.encode() + crlf)
        parts.append(f"Content-Type: {ctype}".encode() + crlf + crlf)
        parts.append(data + crlf)
    parts.append(b"--" + boundary.encode() + b"--" + crlf)
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def _headers():
    h = {}
    key = os.environ.get("SMART_DOC_API_KEY")
    if key:
        h["X-API-Key"] = key
    return h


def upload(api_base, paths, timeout, package_id=None) -> dict:
    body, ctype = build_multipart(paths, package_id)
    url = api_base.rstrip("/") + "/api/material-files"
    headers = {"Content-Type": ctype, **_headers()}
    req = urllib.request.Request(url, data=body, method="POST", headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _list_packages(api_base, timeout) -> list[dict]:
    req = urllib.request.Request(api_base.rstrip("/") + "/api/material-packages", method="GET", headers=_headers())
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def wait_for_status(list_fn, material_file_id, timeout=120, interval=2.0,
                    sleep_fn=time.sleep, clock=time.monotonic):
    """轮询包列表直到该 material_file 的 recognition_status 离开 pending/processing。返回 (status, segment_count)。"""
    deadline = clock() + timeout
    last, segs = None, 0
    while True:
        for pkg in list_fn():
            for f in pkg.get("files", []):
                if f.get("material_file_id") == material_file_id:
                    last = f.get("recognition_status"); segs = f.get("segment_count", 0)
        if last not in ("pending", "processing", None):
            return last, segs
        if clock() >= deadline:
            return last, segs
        sleep_fn(interval)


def main(argv: list[str]) -> int:
    args = argv[1:]
    package_id = None
    if "--package" in args:
        i = args.index("--package")
        package_id = args[i + 1]
        args = args[:i] + args[i + 2:]
    paths = args
    if not paths:
        sys.stderr.write("用法: smart-doc-material [--package <id>] <path> [<path> ...]\n"); return 1
    api_base = os.environ.get("SMART_DOC_API")
    if not api_base:
        sys.stderr.write("[smart-doc-material] 未设置 SMART_DOC_API\n"); return 6
    timeout = int(os.environ.get("SMART_DOC_TIMEOUT", "120"))
    for p in paths:
        if not Path(p).is_file():
            sys.stderr.write(f"[smart-doc-material] 文件不存在: {p}\n"); return 2
    try:
        result = upload(api_base, paths, timeout, package_id)
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"[smart-doc-material] 后端返回 {e.code}: {e.read().decode('utf-8','ignore')[:300]}\n"); return 4
    except urllib.error.URLError as e:
        sys.stderr.write(f"[smart-doc-material] 网络错误: {e.reason}\n"); return 3
    pkg_id = result.get("package_id")
    for it in result.get("items", []):
        mf_id = it.get("material_file_id")
        sys.stdout.write(f"package_id={pkg_id} material_file_id={mf_id} file={it.get('file_name')}\n")
        status, segs = wait_for_status(lambda: _list_packages(api_base, timeout), mf_id, timeout=timeout)
        sys.stdout.write(f"recognition={status} segments={segs}\n")
    failed = result.get("failed", [])
    for f in failed:
        sys.stderr.write(f"FAILED {f.get('name')}: {f.get('reason')}\n")
    return 5 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
