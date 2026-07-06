from __future__ import annotations

# 六维度顺序与标签（与 backend/app/dimensions.py、前端 review-constants 保持一致）
DIMENSION_ORDER: list[str] = [
    "completeness", "normativeness", "compliance",
    "consistency", "rationality", "authenticity",
]
DIMENSION_LABELS: dict[str, str] = {
    "completeness": "完整性", "normativeness": "规范性", "compliance": "合规性",
    "consistency": "一致性", "rationality": "合理性", "authenticity": "真实性",
}

# 结果 code → 中文标签（与前端 review-constants RESULT 一致）
RESULT_LABELS: dict[str, str] = {
    "pass": "通过", "fail": "不通过", "need_review": "待复核",
    "not_applicable": "不适用", "pending": "待判", "error": "错误",
}

# 结果 code → 语义色 hex（Word/PDF 共用；与前端配色语义一致）
RESULT_COLORS: dict[str, str] = {
    "pass": "#52c41a", "fail": "#ff4d4f", "need_review": "#fa8c16",
    "not_applicable": "#8c8c8c", "pending": "#8c8c8c", "error": "#ff4d4f",
}

# 结论 code → 中文标签（与前端 review-constants CONCLUSION 一致）
CONCLUSION_LABELS: dict[str, str] = {
    "reject": "建议不予立项", "fix": "需整改", "accept": "通过", "pending": "待定",
}


def dimension_label(code: str) -> str:
    return DIMENSION_LABELS.get(code, code)


def result_label(key: str) -> str:
    return RESULT_LABELS.get(key, key)


def result_color(key: str) -> str:
    return RESULT_COLORS.get(key, "#000000")


def result_bucket(result_key: str) -> str:
    """把结果归到统计三桶：通过 / 不通过 / 需关注。"""
    if result_key == "pass":
        return "passed"
    if result_key == "fail":
        return "failed"
    return "attention"
