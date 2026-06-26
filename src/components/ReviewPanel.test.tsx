import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReviewPanel from "./ReviewPanel";
import * as matApi from "../api/materials";
import * as revApi from "../api/review";

function renderWithQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const PKG = { package_id: 3, created_at: null, file_count: 1, files: [] };
const REVIEW = {
  round: { round_id: 1, round_no: 1, conclusion: "reject" },
  checks: [{ round_check_id: 9, rule_version_id: 12, rule_code: "R-1", name: "必须有申请人",
             dimension_code: "completeness", initial_result: "fail", initial_disposition: "reject",
             final_result: null, final_disposition: null, effective_result: "fail", status: "open",
             suggestion: "缺申请人", confidence: null, severity: null, version: 0,
             evidence: [{ segment_id: 5, field_code: null, budget_item_id: null, note: "第1段" }] }],
};

async function expandFirst(container: HTMLElement) {
  await waitFor(() => expect(screen.getByText("审查包 #3")).toBeInTheDocument());
  (container.querySelector(".ant-table-row-expand-icon") as HTMLElement)?.click();
}

describe("ReviewPanel", () => {
  it("展开审查包显示结论横幅与发现卡片", async () => {
    vi.spyOn(matApi, "listMaterialPackages").mockResolvedValue([PKG] as never);
    vi.spyOn(revApi, "getPackageReview").mockResolvedValue(REVIEW as never);
    const { container } = renderWithQuery(<ReviewPanel />);
    await expandFirst(container);
    await waitFor(() => expect(screen.getByText("建议不予立项")).toBeInTheDocument());
    expect(screen.getByText("必须有申请人")).toBeInTheDocument();
    expect(screen.getByText("缺申请人")).toBeInTheDocument();
  });

  it("点确认调 postReviewAction", async () => {
    vi.spyOn(matApi, "listMaterialPackages").mockResolvedValue([PKG] as never);
    vi.spyOn(revApi, "getPackageReview").mockResolvedValue(REVIEW as never);
    const spy = vi.spyOn(revApi, "postReviewAction").mockResolvedValue(REVIEW.checks[0] as never);
    const { container } = renderWithQuery(<ReviewPanel />);
    await expandFirst(container);
    await waitFor(() => expect(screen.getByText("确认")).toBeInTheDocument());
    fireEvent.click(screen.getByText("确认"));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(9, { action: "confirm", version: 0 }));
  });

  it("点统计卡按结果筛选", async () => {
    vi.spyOn(matApi, "listMaterialPackages").mockResolvedValue([PKG] as never);
    vi.spyOn(revApi, "getPackageReview").mockResolvedValue(REVIEW as never);
    const { container } = renderWithQuery(<ReviewPanel />);
    await expandFirst(container);
    await waitFor(() => expect(screen.getByText("必须有申请人")).toBeInTheDocument());
    fireEvent.click(screen.getByText("通过").closest("div[data-filter]")!); // 筛"通过"→唯一的 fail 卡片隐藏
    await waitFor(() => expect(screen.queryByText("必须有申请人")).not.toBeInTheDocument());
  });

  it("空状态文案", async () => {
    vi.spyOn(matApi, "listMaterialPackages").mockResolvedValue([] as never);
    renderWithQuery(<ReviewPanel />);
    await waitFor(() => expect(screen.getByText(/暂无可审查/)).toBeInTheDocument());
  });
});
