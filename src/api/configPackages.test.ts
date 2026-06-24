import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { listConfigPackages } from "./configPackages";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

test("listConfigPackages 请求配置包列表并解析", async () => {
  fetchMock.mockResolvedValue({
    ok: true, status: 200,
    json: async () => [
      { doc_id: 3, doc_code: "SD-x", title: "t", version: "V1.0", rule_count: 2, dimensions: ["合规性"] },
    ],
  });
  const res = await listConfigPackages();
  expect(fetchMock).toHaveBeenCalledWith("/api/config-packages");
  expect(res[0].rule_count).toBe(2);
  expect(res[0].dimensions).toEqual(["合规性"]);
});

test("非 2xx 抛错", async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: "err", text: async () => "boom" });
  await expect(listConfigPackages()).rejects.toThrow(/500/);
});
