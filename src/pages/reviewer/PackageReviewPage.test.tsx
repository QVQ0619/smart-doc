import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PackageReviewPage from "./PackageReviewPage";
import * as materialsApi from "../../api/materials";

// ReviewWorkbench 依赖 react-query，隔离掉，只验证 PackageReviewPage 把选中的 packageId 传下去
vi.mock("../../components/review/ReviewWorkbench", () => ({
  default: ({ packageId }: { packageId: number }) => <div data-testid="workbench">wb:{packageId}</div>,
}));

describe("PackageReviewPage", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("加载申报包并默认展示第一个包的 ReviewWorkbench", async () => {
    vi.spyOn(materialsApi, "listMaterialPackages").mockResolvedValue([
      { package_id: 3, created_at: null, file_count: 2, files: [] },
    ] as never);
    render(<PackageReviewPage />);
    await waitFor(() => expect(screen.getByTestId("workbench").textContent).toBe("wb:3"));
  });

  it("传入 packageId 时优先展示它", async () => {
    vi.spyOn(materialsApi, "listMaterialPackages").mockResolvedValue([
      { package_id: 3, created_at: null, file_count: 2, files: [] },
      { package_id: 5, created_at: null, file_count: 1, files: [] },
    ] as never);
    render(<PackageReviewPage packageId={5} />);
    await waitFor(() => expect(screen.getByTestId("workbench").textContent).toBe("wb:5"));
  });

  it("无申报包时提示为空", async () => {
    vi.spyOn(materialsApi, "listMaterialPackages").mockResolvedValue([] as never);
    render(<PackageReviewPage />);
    await waitFor(() => expect(screen.getByText("暂无申报包")).toBeTruthy());
  });
});
