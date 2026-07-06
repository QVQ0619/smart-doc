import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportPackageReport } from "./review";

describe("exportPackageReport", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => vi.restoreAllMocks());

  it("GET 正确 URL 并触发下载（含文件名）", async () => {
    const blob = new Blob(["zipbytes"], { type: "application/zip" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(blob, { status: 200, headers: {
        "Content-Disposition": "attachment; filename=report_3.zip; filename*=UTF-8''%E6%8A%A5%E5%91%8A.zip",
      } })));
    const createURL = vi.fn().mockReturnValue("blob:x");
    const revokeURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: createURL, revokeObjectURL: revokeURL });
    const click = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);

    await exportPackageReport(3);

    expect(fetch).toHaveBeenCalledWith("/api/packages/3/report/export");
    expect(createURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeURL).toHaveBeenCalledWith("blob:x");
  });

  it("非 2xx 抛错", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("尚未审查", { status: 409 })));
    await expect(exportPackageReport(3)).rejects.toThrow("HTTP 409");
  });
});
