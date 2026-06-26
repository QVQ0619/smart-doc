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

describe("FindingCard (P1)", () => {
  it("显示置信度与严重度，低置信加标记", () => {
    render(<FindingCard check={{ ...FAIL, confidence: 0.52, severity: 2 }}
      onConfirm={() => {}} onEvidence={() => {}} onOverrule={() => {}} />);
    expect(screen.getByText(/置信度 52%/)).toBeInTheDocument();
    expect(screen.getByText(/严重度 中/)).toBeInTheDocument();
    expect(screen.getByText("⚠ 建议人工")).toBeInTheDocument();
  });

  it("高置信不出现建议人工标记", () => {
    render(<FindingCard check={{ ...FAIL, confidence: 0.91, severity: 3 }}
      onConfirm={() => {}} onEvidence={() => {}} onOverrule={() => {}} />);
    expect(screen.queryByText("⚠ 建议人工")).not.toBeInTheDocument();
    expect(screen.getByText(/严重度 高/)).toBeInTheDocument();
  });

  it("已改判项显示机审→人工箭头链，不再显示操作按钮", () => {
    render(<FindingCard check={{ ...FAIL, status: "overruled", initial_result: "fail", final_result: "pass" }}
      onConfirm={() => {}} onEvidence={() => {}} onOverrule={() => {}} />);
    expect(screen.getByText(/机审 不通过/)).toBeInTheDocument();
    expect(screen.getByText(/人工 通过/)).toBeInTheDocument();
    expect(screen.queryByText("确认")).not.toBeInTheDocument();
  });
});
