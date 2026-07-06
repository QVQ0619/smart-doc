from app.report_builder import _clean_quote, assemble_report_model
from app.reporting.model import EvidenceRef
from app.schemas import CheckOut, EvidenceOut, ReviewResultOut, RoundOut


def test_clean_quote_dedupes_repeated_table_cells_and_joins_rows():
    raw = ("申请人信息 | 申请人信息 | 申请人信息 | 申请人信息\n"
           "姓名 | 姓名 | 张　明 | 张　明 | 性别 | 性别")
    out = _clean_quote(raw)
    # 连续重复单元格折叠为一个；行间用 '；' 连
    assert out == "申请人信息；姓名 | 张　明 | 性别"
    # 不再包含原始的重复串
    assert "申请人信息 | 申请人信息" not in out


def test_clean_quote_truncates_long_text_with_ellipsis():
    raw = "甲 | 乙 | 丙 | " + " | ".join(str(i) for i in range(100))
    out = _clean_quote(raw, limit=20)
    assert len(out) <= 21 and out.endswith("…")


def test_clean_quote_empty_returns_dash():
    assert _clean_quote("") == "—"
    assert _clean_quote("   \n  ") == "—"


def _check(**kw):
    base = dict(round_check_id=1, rule_version_id=1, rule_code="R-1", name="规则",
                dimension_code="completeness", initial_result="pass",
                initial_disposition=None, final_result=None, final_disposition=None,
                effective_result="pass", status="open", suggestion=None,
                confidence=None, severity=None, version=0, evidence=[])
    base.update(kw)
    return CheckOut(**base)


def _stub_resolver(e):
    return EvidenceRef(quote="引文", locator="材料/第1页")


def _assemble(checks, conclusion="fix"):
    rr = ReviewResultOut(round=RoundOut(round_id=1, round_no=1, conclusion=conclusion),
                         checks=checks)
    return assemble_report_model(title="立项审查报告",
                                 cover=[("项目名称", "X")], review_result=rr,
                                 resolve_evidence=_stub_resolver)


def test_overruled_check_has_audit_confirmed_does_not():
    over = _check(round_check_id=1, status="overruled", initial_result="pass",
                  final_result="fail", final_disposition="reject",
                  effective_result="fail")
    conf = _check(round_check_id=2, status="confirmed", initial_result="pass",
                  final_result="pass", effective_result="pass")
    rm = _assemble([over, conf])
    findings = rm.sections[0].findings
    by_result = {f.result_key: f for f in findings}
    assert by_result["fail"].audit is not None          # 改判 → 有留痕
    assert by_result["fail"].audit.initial == "通过"
    assert by_result["fail"].audit.final == "不通过"
    assert by_result["pass"].audit is None              # 仅 confirm → 无留痕


def test_dimension_stats_three_buckets():
    checks = [
        _check(round_check_id=1, effective_result="pass"),
        _check(round_check_id=2, effective_result="fail"),
        _check(round_check_id=3, effective_result="need_review"),
    ]
    rm = _assemble(checks)
    stat = next(s for s in rm.dimension_stats if s.dimension_label == "完整性")
    assert (stat.passed, stat.failed, stat.attention) == (1, 1, 1)


def test_evidence_resolved_and_empty_shows_via_model():
    c = _check(evidence=[EvidenceOut(segment_id=5, field_code=None,
                                     budget_item_id=None, note="见第1段")])
    rm = _assemble([c])
    ev = rm.sections[0].findings[0].evidence
    assert ev[0].quote == "引文" and ev[0].locator == "材料/第1页"


def test_conclusion_text_and_title():
    rm = _assemble([_check(effective_result="pass")], conclusion="accept")
    assert rm.title == "立项审查报告"
    assert "综合结论：通过" in rm.conclusion_text
