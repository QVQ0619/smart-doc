import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FindingCard from "./FindingCard";
import type { ReviewCheck } from "../../api/review";

const FAIL: ReviewCheck = {
  round_check_id: 9, rule_version_id: 1, rule_code: "SD-RULE-014", name: "负责人连续承担年限不满足",
  dimension_code: "compliance", initial_result: "fail", initial_disposition: null, final_result: null,
  final_disposition: null, effective_result: "fail", status: "open", suggestion: "近3年须连续承担",
  confidence: null, severity: null, version: 0,
  evidence: [{ segment_id: 3, field_code: null, budget_item_id: null, note: null }],
};

describe("FindingCard (P0)", () => {
  it("渲染规则名、建议、出处与机审判定", () => {
    render(<FindingCard check={FAIL} onConfirm={() => {}} onEvidence={() => {}} onOverrule={() => {}} />);
    expect(screen.getByText("负责人连续承担年限不满足")).toBeInTheDocument();
    expect(screen.getByText("近3年须连续承担")).toBeInTheDocument();
    expect(screen.getByText(/段落#3/)).toBeInTheDocument();
    expect(screen.getByText(/不通过/)).toBeInTheDocument();
  });

  it("点确认/改判/出处分别回调", () => {
    const onConfirm = vi.fn(), onOverrule = vi.fn(), onEvidence = vi.fn();
    render(<FindingCard check={FAIL} onConfirm={onConfirm} onEvidence={onEvidence} onOverrule={onOverrule} />);
    fireEvent.click(screen.getByText("确认"));
    fireEvent.click(screen.getByText("改判"));
    fireEvent.click(screen.getByText(/段落#3/));
    expect(onConfirm).toHaveBeenCalledWith(FAIL);
    expect(onOverrule).toHaveBeenCalledWith(FAIL);
    expect(onEvidence).toHaveBeenCalledWith(FAIL);
  });
});
