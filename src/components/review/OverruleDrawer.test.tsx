import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OverruleDrawer from "./OverruleDrawer";
import type { ReviewCheck } from "../../api/review";

const CHK: ReviewCheck = { round_check_id: 1, rule_version_id: 1, rule_code: "R", name: "设备费占比超限",
  dimension_code: "rationality", initial_result: "fail", initial_disposition: null, final_result: null,
  final_disposition: null, effective_result: "fail", status: "open", suggestion: "超过 20% 上限",
  confidence: 0.91, severity: 3, version: 2, evidence: [] };

describe("OverruleDrawer", () => {
  it("未选结果或未填意见不提交", () => {
    const onSubmit = vi.fn();
    render(<OverruleDrawer check={CHK} onClose={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText("提交改判"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("选结果+填意见后提交回调", () => {
    const onSubmit = vi.fn();
    render(<OverruleDrawer check={CHK} onClose={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText("✓ 通过"));
    fireEvent.change(screen.getByPlaceholderText(/处置意见/), { target: { value: "已补充材料" } });
    fireEvent.click(screen.getByText("提交改判"));
    expect(onSubmit).toHaveBeenCalledWith("pass", "已补充材料");
  });
});
