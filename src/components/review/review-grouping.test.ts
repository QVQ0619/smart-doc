import { describe, it, expect } from "vitest";
import { countChecks, groupByDimension, resultOf, evidenceLabel } from "./review-grouping";
import { dimensionLabel } from "./review-constants";
import type { ReviewCheck } from "../../api/review";

function chk(over: Partial<ReviewCheck>): ReviewCheck {
  return {
    round_check_id: 1, rule_version_id: 1, rule_code: "R", name: "规则", dimension_code: "completeness",
    initial_result: "pass", initial_disposition: null, final_result: null, final_disposition: null,
    effective_result: "pass", status: "open", suggestion: null, confidence: null, severity: null,
    version: 0, evidence: [], ...over,
  };
}

describe("review-grouping", () => {
  it("resultOf 优先 final_result，其次 effective，再 initial", () => {
    expect(resultOf(chk({ final_result: "pass", effective_result: "fail", initial_result: "fail" }))).toBe("pass");
    expect(resultOf(chk({ final_result: null, effective_result: "fail", initial_result: "pass" }))).toBe("fail");
  });

  it("countChecks 按结果计数", () => {
    const c = countChecks([chk({ effective_result: "pass" }), chk({ effective_result: "fail" }),
      chk({ effective_result: "need_review" })]);
    expect(c).toEqual({ pass: 1, fail: 1, need_review: 1, not_applicable: 0 });
  });

  it("groupByDimension 把有问题的维度排前面", () => {
    const groups = groupByDimension([
      chk({ dimension_code: "completeness", effective_result: "pass" }),
      chk({ dimension_code: "compliance", effective_result: "fail" }),
    ]);
    expect(groups.map((g) => g.code)).toEqual(["compliance", "completeness"]);
    expect(groups[0].hasProblem).toBe(true);
    expect(groups[1].hasProblem).toBe(false);
  });

  it("dimensionLabel 已知映射中文，未知回退原 code", () => {
    expect(dimensionLabel("rationality")).toBe("合理性");
    expect(dimensionLabel("unknown_x")).toBe("unknown_x");
  });

  it("evidenceLabel 拼出处文本，多条用顿号连接", () => {
    expect(evidenceLabel(chk({ evidence: [
      { segment_id: 5, field_code: null, budget_item_id: null, note: null },
      { segment_id: null, field_code: "title", budget_item_id: null, note: null },
    ] }))).toBe("段落#5、字段:title");
    expect(evidenceLabel(chk({ evidence: [] }))).toBe("—");
  });
});
