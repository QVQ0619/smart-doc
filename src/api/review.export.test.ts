import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportPackageReport } from "./review";

describe("exportPackageReport", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => vi.restoreAllMocks());

  it("分别请求 docx 与 pdf 并各触发一次下载", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const ext = url.includes("format=pdf") ? "pdf" : "docx";
      return Promise.resolve(
        new Response(new Blob([ext]), {
          status: 200,
          headers: { "Content-Disposition": `attachment; filename=report_3.${ext}` },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const createURL = vi.fn().mockReturnValue("blob:x");
    const revokeURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: createURL, revokeObjectURL: revokeURL });
    const click = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);

    await exportPackageReport(3);

    // 两次请求:docx + pdf,不再有 zip
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain("/api/packages/3/report/export?format=docx");
    expect(urls).toContain("/api/packages/3/report/export?format=pdf");
    expect(urls.every((u) => !u.endsWith("/report/export"))).toBe(true);
    // 两个文件各下载一次
    expect(createURL).toHaveBeenCalledTimes(2);
    expect(click).toHaveBeenCalledTimes(2);
    expect(revokeURL).toHaveBeenCalledTimes(2);
  });

  it("某个格式非 2xx 抛错", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("尚未审查", { status: 409 })));
    await expect(exportPackageReport(3)).rejects.toThrow("HTTP 409");
  });
});
