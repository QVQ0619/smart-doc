import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPackageReview, postReviewAction } from "./review";

describe("review api", () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  it("getPackageReview 请求正确 URL", async () => {
    const data = { round: null, checks: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status: 200 })));
    expect(await getPackageReview(3)).toEqual(data);
    expect(fetch).toHaveBeenCalledWith("/api/packages/3/review");
  });
  it("postReviewAction POST 带 body 与 Content-Type", async () => {
    const check = { round_check_id: 5, version: 1 };
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(check), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await postReviewAction(5, { action: "confirm", version: 0 });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/round-checks/5/review-action");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });
  it("非 2xx 抛错", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 409 })));
    await expect(postReviewAction(5, { action: "confirm", version: 9 })).rejects.toThrow("HTTP 409");
  });
});
