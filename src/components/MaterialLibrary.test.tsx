import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MaterialLibrary from "./MaterialLibrary";
import * as api from "../api/materials";

function renderWithQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("MaterialLibrary", () => {
  it("渲染审查包列表", async () => {
    vi.spyOn(api, "listMaterialPackages").mockResolvedValue([
      { package_id: 3, created_at: null, file_count: 1,
        files: [{ material_file_id: 9, file_name: "申请书.docx", material_category: "申请书",
                  recognition_status: "done", segment_count: 5 }] }]);
    renderWithQuery(<MaterialLibrary />);
    await waitFor(() => expect(screen.getByText("审查包 #3")).toBeInTheDocument());
  });

  it("空状态文案", async () => {
    vi.spyOn(api, "listMaterialPackages").mockResolvedValue([]);
    renderWithQuery(<MaterialLibrary />);
    await waitFor(() => expect(screen.getByText(/暂无审查材料/)).toBeInTheDocument());
  });
});
