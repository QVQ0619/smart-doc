from __future__ import annotations

import io
import zipfile


def package_zip(files: dict[str, bytes]) -> bytes:
    """把 {文件名: 字节} 打包成一个 zip 的字节。"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()
