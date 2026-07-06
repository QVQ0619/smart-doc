import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReviewWorkbench from "./ReviewWorkbench";
import * as reviewApi from "../../api/review";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const reviewedData = {
  round: { round_id: 1, round_no: 1, conclusion: "fix" },
  checks: [{
    round_check_id: 1, rule_version_id: 1, rule_code: "R-1", name: "规则",
    dimension_code: "completeness", initial_result: "fail", initial_disposition: "reject",
    final_result: null, final_disposition: null, effective_result: "fail",
    status: "open", suggestion: "缺", confidence: 0.9, severity: 3, version: 0, evidence: [],
  }],
};

describe("ReviewWorkbench 导出报告按钮", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => vi.restoreAllMocks());

  it("已审查时显示按钮并可点击触发导出", async () => {
    vi.spyOn(reviewApi, "getPackageReview").mockResolvedValue(reviewedData as never);
    const spy = vi.spyOn(reviewApi, "exportPackageReport").mockResolvedValue(undefined);
    renderWithClient(<ReviewWorkbench packageId={7} />);
    const btn = await screen.findByRole("button", { name: /导出报告/ });
    fireEvent.click(btn);
    await waitFor(() => expect(spy).toHaveBeenCalledWith(7));
  });

  it("未审查(round=null)时不显示按钮", async () => {
    vi.spyOn(reviewApi, "getPackageReview").mockResolvedValue({ round: null, checks: [] } as never);
    renderWithClient(<ReviewWorkbench packageId={7} />);
    await waitFor(() => expect(screen.getByText(/尚未形式审查/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /导出报告/ })).toBeNull();
  });
});
