from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class EvidenceRef:
    quote: str
    locator: str


@dataclass
class AuditTrail:
    initial: str      # 机审初判结果文字
    final: str        # 人工改判后结果文字
    disposition: str  # 处置说明


@dataclass
class Finding:
    result_label: str
    result_key: str
    rule_code: str
    name: str
    severity: Optional[int]
    confidence: Optional[float]
    suggestion: str
    evidence: list[EvidenceRef]
    audit: Optional[AuditTrail]


@dataclass
class Section:
    dimension_label: str
    findings: list[Finding]


@dataclass
class DimensionStat:
    dimension_label: str
    passed: int
    failed: int
    attention: int


@dataclass
class ReportModel:
    title: str
    cover: list[tuple[str, str]]   # 有序键值对
    conclusion_text: str
    dimension_stats: list[DimensionStat]
    sections: list[Section]
    footer_note: str
