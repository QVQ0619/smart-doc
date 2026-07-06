from app.report_builder import assemble_report_model
from app.reporting.model import EvidenceRef
from app.schemas import CheckOut, EvidenceOut, ReviewResultOut, RoundOut


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
