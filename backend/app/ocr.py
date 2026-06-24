"""OCR 引擎封装（RapidOCR + PyMuPDF 栅格化）。

可选依赖：未安装时 OCR_AVAILABLE=False，所有函数返回 []，绝不抛异常。
"""
from __future__ import annotations

from pathlib import Path

try:
    import fitz  # PyMuPDF
    from rapidocr_onnxruntime import RapidOCR

    OCR_AVAILABLE = True
except ImportError:  # pragma: no cover - 取决于部署环境是否装了 OCR 组件
    OCR_AVAILABLE = False

_RENDER_DPI = 250
_engine = None  # RapidOCR 延迟单例


def _get_engine():
    global _engine
    if _engine is None:
        _engine = RapidOCR()
    return _engine


def _run(image_or_path) -> list[str]:
    """RapidOCR 返回 (result, elapse)，result 为 [[box, text, score], ...] 或 None。"""
    result, _ = _get_engine()(image_or_path)
    if not result:
        return []
    return [str(item[1]).strip() for item in result if str(item[1]).strip()]


def ocr_image(path: Path) -> list[str]:
    if not OCR_AVAILABLE:
        return []
    try:
        return _run(str(path))
    except Exception:  # noqa: BLE001 - OCR 失败降级为空，由上层落 failed
        return []


def ocr_pdf_page(page) -> list[str]:
    """page 为 fitz.Page；按 _RENDER_DPI 栅格化为 PNG 字节后送 OCR。"""
    if not OCR_AVAILABLE:
        return []
    try:
        pix = page.get_pixmap(dpi=_RENDER_DPI)
        import numpy as np

        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 4:  # RGBA -> RGB
            img = img[:, :, :3]
        return _run(img)
    except Exception:  # noqa: BLE001
        return []
