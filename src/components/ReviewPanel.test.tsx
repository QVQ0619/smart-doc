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

  it("点出处打开原文抽屉", async () => {
    vi.spyOn(matApi, "listMaterialPackages").mockResolvedValue([PKG] as never);
    vi.spyOn(revApi, "getPackageReview").mockResolvedValue(REVIEW as never);
    vi.spyOn(matApi, "getPackageSegments").mockResolvedValue([{ material_file_id: 1, file_name: "a.pdf",
      segments: [{ id: 5, page_no: 1, locator: null, segment_type: "text", content_text: "申请人原文片段" }] }] as never);
    vi.spyOn(matApi, "getPackageStructured").mockResolvedValue(
      { package_id: 3, members: [], coop_units: [], budget_items: [], attachments: [], fields: [] } as never);
    const { container } = renderWithQuery(<ReviewPanel />);
    await expandFirst(container);
    await waitFor(() => expect(screen.getByText(/段落#5/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/段落#5/));
    await waitFor(() => expect(screen.getByText(/申请人原文片段/)).toBeInTheDocument());
  });

  // FIX 1 回归：点「通过」统计卡后，全通过维度组自动展开，其通过卡片变为可见
  it("点通过统计卡自动展开全通过维度组", async () => {
    // fixture：compliance 组有 fail 项（默认展开）；completeness 组全 pass（默认折叠，hasProblem=false）
    const REVIEW_MULTI = {
      round: { round_id: 1, round_no: 1, conclusion: "reject" },
      checks: [
        { round_check_id: 1, rule_version_id: 1, rule_code: "R-1", name: "合规失败项",
          dimension_code: "compliance", initial_result: "fail", initial_disposition: "reject",
          final_result: null, final_disposition: null, effective_result: "fail", status: "open",
          suggestion: null, confidence: null, severity: null, version: 0, evidence: [] },
        { round_check_id: 2, rule_version_id: 2, rule_code: "R-2", name: "完整性通过项",
          dimension_code: "completeness", initial_result: "pass", initial_disposition: null,
          final_result: null, final_disposition: null, effective_result: "pass", status: "open",
          suggestion: null, confidence: null, severity: null, version: 0, evidence: [] },
      ],
    };
    vi.spyOn(matApi, "listMaterialPackages").mockResolvedValue([PKG] as never);
    vi.spyOn(revApi, "getPackageReview").mockResolvedValue(REVIEW_MULTI as never);
    const { container } = renderWithQuery(<ReviewPanel />);
    await expandFirst(container);
    // 初始：completeness 组折叠，"完整性通过项"不可见
    await waitFor(() => expect(screen.getByText("合规失败项")).toBeInTheDocument());
    expect(screen.queryByText("完整性通过项")).not.toBeInTheDocument();
    // 点「通过」统计卡
    fireEvent.click(screen.getByText("通过").closest("div[data-filter]")!);
    // 预期：全通过组自动展开，"完整性通过项" 可见；fail 组隐藏（无 pass 卡片故被过滤掉）
    await waitFor(() => expect(screen.getByText("完整性通过项")).toBeInTheDocument());
    expect(screen.queryByText("合规失败项")).not.toBeInTheDocument();
  });
});
