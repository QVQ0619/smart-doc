from app.reporting import model, styles


def test_report_model_constructs_and_holds_fields():
    ev = model.EvidenceRef(quote="申请人:张三", locator="申请书/第1页")
    audit = model.AuditTrail(initial="通过", final="不通过", disposition="预算表缺失")
    f = model.Finding(result_label="不通过", result_key="fail", rule_code="R-1",
                      name="必须有预算表", severity=3, confidence=0.9,
                      suggestion="应补充预算表", evidence=[ev], audit=audit)
    sec = model.Section(dimension_label="完整性", findings=[f])
    stat = model.DimensionStat(dimension_label="完整性", passed=1, failed=1, attention=0)
    rm = model.ReportModel(title="立项审查报告", cover=[("项目名称", "X")],
                           conclusion_text="综合结论：需整改", dimension_stats=[stat],
                           sections=[sec], footer_note="系统生成")
    assert rm.title == "立项审查报告"
    assert rm.sections[0].findings[0].audit.final == "不通过"
    assert rm.cover[0] == ("项目名称", "X")


def test_styles_dimension_order_and_labels_match_backend():
    assert styles.DIMENSION_ORDER == ["completeness", "normativeness", "compliance",
                                      "consistency", "rationality", "authenticity"]
    assert styles.DIMENSION_LABELS["completeness"] == "完整性"
    assert styles.RESULT_LABELS["fail"] == "不通过"
    assert styles.CONCLUSION_LABELS["fix"] == "需整改"


def test_result_bucket_three_way():
    assert styles.result_bucket("pass") == "passed"
    assert styles.result_bucket("fail") == "failed"
    assert styles.result_bucket("need_review") == "attention"
    assert styles.result_bucket("not_applicable") == "attention"
