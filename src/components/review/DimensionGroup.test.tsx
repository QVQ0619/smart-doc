import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DimensionGroup from "./DimensionGroup";
import type { DimensionGroupData } from "./review-grouping";
import type { ReviewCheck } from "../../api/review";

function chk(over: Partial<ReviewCheck>): ReviewCheck {
  return { round_check_id: 1, rule_version_id: 1, rule_code: "R", name: "规则X", dimension_code: "compliance",
    initial_result: "fail", initial_disposition: null, final_result: null, final_disposition: null,
    effective_result: "fail", status: "open", suggestion: null, confidence: null, severity: null,
    version: 0, evidence: [], ...over };
}
const GROUP: DimensionGroupData = {
  code: "compliance", label: "合规性", hasProblem: true,
  counts: { pass: 1, fail: 1, need_review: 0, not_applicable: 0 },
  checks: [chk({ round_check_id: 1, name: "不通过项", effective_result: "fail" }),
           chk({ round_check_id: 2, name: "通过项", effective_result: "pass" })],
};

describe("DimensionGroup", () => {
  it("显示维度名与组内卡片", () => {
    render(<DimensionGroup group={GROUP} filter={null} onConfirm={() => {}} onEvidence={() => {}}
      onOverrule={() => {}} onConfirmGroup={() => {}} />);
    expect(screen.getByText("合规性")).toBeInTheDocument();
    expect(screen.getByText("不通过项")).toBeInTheDocument();
    expect(screen.getByText("通过项")).toBeInTheDocument();
  });

  it("点确认本组通过项回调整组", () => {
    const onConfirmGroup = vi.fn();
    render(<DimensionGroup group={GROUP} filter={null} onConfirm={() => {}} onEvidence={() => {}}
      onOverrule={() => {}} onConfirmGroup={onConfirmGroup} />);
    fireEvent.click(screen.getByText("确认本组通过项"));
    expect(onConfirmGroup).toHaveBeenCalledWith(GROUP);
  });

  it("filter 只显示匹配结果的卡片", () => {
    render(<DimensionGroup group={GROUP} filter="fail" onConfirm={() => {}} onEvidence={() => {}}
      onOverrule={() => {}} onConfirmGroup={() => {}} />);
    expect(screen.getByText("不通过项")).toBeInTheDocument();
    expect(screen.queryByText("通过项")).not.toBeInTheDocument();
  });
});
