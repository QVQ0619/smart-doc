import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadReport, fetchReportBlobUrl } from "./tasks";

describe("审查报告 下载/预览 助手", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("fetchReportBlobUrl 命中下载端点并返回对象URL", async () => {
    const blob = new Blob(["x"], { type: "application/pdf" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(blob, { status: 200 })));
    vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:report"), revokeObjectURL: vi.fn() });
    const url = await fetchReportBlobUrl(3, 7);
    expect((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toBe(
      "/api/tasks/3/reports/7/download",
    );
    expect(url).toBe("blob:report");
  });

  it("downloadReport 取 blob 并触发 <a download>", async () => {
    const blob = new Blob(["x"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(blob, { status: 200 })));
    vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:dl"), revokeObjectURL: vi.fn() });
    const click = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
    await downloadReport(3, 7, "综合论证审查报告.docx");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("downloadReport 端点非2xx 抛错", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 404 })));
    vi.stubGlobal("URL", { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() });
    await expect(downloadReport(3, 7, "a.docx")).rejects.toThrow("HTTP 404");
  });
});
