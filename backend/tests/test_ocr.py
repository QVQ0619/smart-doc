from pathlib import Path

import app.ocr as ocr


def test_ocr_available_is_bool():
    assert isinstance(ocr.OCR_AVAILABLE, bool)


def test_ocr_image_returns_list_and_degrades(monkeypatch):
    # OCR 不可用时必须返回 []，绝不抛异常
    monkeypatch.setattr(ocr, "OCR_AVAILABLE", False)
    assert ocr.ocr_image(Path("nonexistent.png")) == []


def test_ocr_pdf_page_degrades(monkeypatch):
    monkeypatch.setattr(ocr, "OCR_AVAILABLE", False)
    assert ocr.ocr_pdf_page(object()) == []
