import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MaterialLibrary from "./MaterialLibrary";
import * as api from "../api/materials";
import * as batchesApi from "../api/batches";

// DocxPreview 真渲染依赖 docx-preview + fetch,jsdom 里 mock 成占位组件
vi.mock("./DocxPreview", () => ({
  default: ({ name }: { name: string }) => <div data-testid="docx-preview">{name}</div>,
}));

function renderWithQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("MaterialLibrary", () => {
  it("渲染审查包列表", async () => {
    vi.spyOn(api, "listMaterialPackages").mockResolvedValue([
      { package_id: 3, created_at: null, file_count: 1,
        files: [{ material_file_id: 9, file_name: "申请书.docx", material_category: "application_form",
                  recognition_status: "done", segment_count: 5 }] }]);
    renderWithQuery(<MaterialLibrary />);
    await waitFor(() => expect(screen.getByText("审查包 #3")).toBeInTheDocument());
  });

  it("空状态文案", async () => {
    vi.spyOn(api, "listMaterialPackages").mockResolvedValue([]);
    renderWithQuery(<MaterialLibrary />);
    await waitFor(() => expect(screen.getByText(/暂无审查材料/)).toBeInTheDocument());
  });

  it("展开审查包显示结构化成员", async () => {
    vi.spyOn(api, "listMaterialPackages").mockResolvedValue([
      { package_id: 3, created_at: null, file_count: 1,
        files: [{ material_file_id: 9, file_name: "申请书.docx", material_category: "application_form",
                  recognition_status: "done", segment_count: 5 }] }]);
    vi.spyOn(api, "getPackageStructured").mockResolvedValue({
      package_id: 3, members: [{ id: 1, member_role: "applicant", name: "张三", title: "教授",
        unit_name: "某所", source_segment_id: 12 }],
      coop_units: [], budget_items: [], attachments: [], fields: [] });
    const { container } = renderWithQuery(<MaterialLibrary />);
    await waitFor(() => expect(screen.getByText("审查包 #3")).toBeInTheDocument());
    // 展开包行
    const expandBtn = container.querySelector(".ant-table-row-expand-icon") as HTMLElement;
    expect(expandBtn).toBeTruthy();
    expandBtn.click();
    await waitFor(() => expect(screen.getByText("张三")).toBeInTheDocument());
  });

  it("传 batchId → 调用 listBatchPackages 而非 listMaterialPackages", async () => {
    const batchPkgSpy = vi
      .spyOn(batchesApi, "listBatchPackages")
      .mockResolvedValue([]);
    const globalPkgSpy = vi
      .spyOn(api, "listMaterialPackages")
      .mockResolvedValue([]);
    renderWithQuery(<MaterialLibrary batchId={7} />);
    await waitFor(() => expect(batchPkgSpy).toHaveBeenCalledWith(7));
    expect(globalPkgSpy).not.toHaveBeenCalled();
  });

  it("展开文件列表点击查看原文件→预览弹窗出现(docx 在线预览)", async () => {
    vi.spyOn(api, "listMaterialPackages").mockResolvedValue([
      { package_id: 3, created_at: null, file_count: 1,
        files: [{ material_file_id: 9, file_name: "申请书.docx", material_category: "application_form",
                  recognition_status: "done", segment_count: 5 }] }]);
    vi.spyOn(api, "getPackageStructured").mockResolvedValue({
      package_id: 3, members: [], coop_units: [], budget_items: [], attachments: [], fields: [],
    } as never);
    const { container } = renderWithQuery(<MaterialLibrary />);
    await waitFor(() => expect(screen.getByText("审查包 #3")).toBeInTheDocument());
    // 展开包行显示文件列表
    const expandBtn = container.querySelector(".ant-table-row-expand-icon") as HTMLElement;
    expandBtn.click();
    // 等文件行中"查看原文件"出现
    await waitFor(() => expect(screen.getByText("查看原文件")).toBeInTheDocument());
    // 点击查看原文件（申请书.docx → DocxPreview 在线预览,已 mock 成占位）
    await userEvent.click(screen.getByText("查看原文件"));
    await waitFor(() => expect(screen.getByTestId("docx-preview")).toBeInTheDocument());
    expect(screen.queryByText(/暂不支持在线预览/)).not.toBeInTheDocument();
    expect(document.body.querySelector("iframe")).toBeNull();
  });
});
