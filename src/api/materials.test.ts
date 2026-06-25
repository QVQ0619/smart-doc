import { describe, it, expect, vi, beforeEach } from "vitest";
import { listMaterialPackages, listMaterialSegments } from "./materials";

describe("materials api", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it("listMaterialPackages 请求正确 URL 并解析", async () => {
    const data = [{ package_id: 1, created_at: null, file_count: 1, files: [] }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(data), { status: 200 })));
    expect(await listMaterialPackages()).toEqual(data);
    expect(fetch).toHaveBeenCalledWith("/api/material-packages");
  });
  it("非 2xx 抛错", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    await expect(listMaterialSegments(7)).rejects.toThrow("HTTP 500");
  });
});
