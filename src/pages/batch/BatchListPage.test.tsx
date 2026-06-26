import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BatchListPage from "./BatchListPage";
import * as api from "../../api/batches";
import { useRouteStore } from "../../store/useRouteStore";

function renderWithQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockBatch = {
  id: 1,
  batch_no: "B-2026-01",
  project_type_name: "科研项目",
  stage_name: "申报",
  status: "reviewing",
  declare_period: "2026.03–2026.05",
  material_count: 3,
  rule_doc_count: 2,
  rule_count: 10,
};

describe("BatchListPage", () => {
  beforeEach(() => {
    // 每个测试前重置路由状态
    useRouteStore.setState({ nav: { name: "home" } });
  });

  it("渲染批次卡片列表（含批次号、计数）", async () => {
    vi.spyOn(api, "listBatches").mockResolvedValue([mockBatch]);
    renderWithQuery(<BatchListPage />);
    await waitFor(() =>
      expect(screen.getByText("B-2026-01")).toBeInTheDocument(),
    );
    // 统计数字也在卡片中
    expect(screen.getByText("3")).toBeInTheDocument(); // material_count
    expect(screen.getByText("2")).toBeInTheDocument(); // rule_doc_count
    expect(screen.getByText("10")).toBeInTheDocument(); // rule_count
  });

  it("点击进入批次按钮 → navigate 到 batch-detail 且 batchId 正确", async () => {
    vi.spyOn(api, "listBatches").mockResolvedValue([mockBatch]);
    renderWithQuery(<BatchListPage />);
    await waitFor(() =>
      expect(screen.getByText("进入批次")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText("进入批次"));
    const nav = useRouteStore.getState().nav;
    expect(nav).toMatchObject({
      name: "batch-detail",
      batchId: 1,
      batchTitle: "B-2026-01",
    });
  });

  it("点击新建批次按钮 → CreateBatchModal 弹出", async () => {
    vi.spyOn(api, "listBatches").mockResolvedValue([]);
    renderWithQuery(<BatchListPage />);
    // 工具栏的"新建批次"按钮渲染后点击
    const createBtn = await screen.findByRole("button", { name: /新建批次/ });
    await userEvent.click(createBtn);
    // Modal 打开后，表单中"批次号"标签可见
    await waitFor(() =>
      expect(screen.getByLabelText(/批次号/)).toBeInTheDocument(),
    );
  });

  it("空列表显示引导文案", async () => {
    vi.spyOn(api, "listBatches").mockResolvedValue([]);
    renderWithQuery(<BatchListPage />);
    await waitFor(() =>
      expect(screen.getByText(/暂无批次/)).toBeInTheDocument(),
    );
  });

  it("加载失败显示错误提示", async () => {
    vi.spyOn(api, "listBatches").mockRejectedValue(new Error("网络错误"));
    renderWithQuery(<BatchListPage />);
    await waitFor(() =>
      expect(screen.getByText("批次加载失败")).toBeInTheDocument(),
    );
  });
});
