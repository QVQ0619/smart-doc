import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  listBatches,
  createBatch,
  getBatchDetail,
  bindRuleDocs,
  listBatchStandardDocs,
  listBatchPackages,
} from "./batches";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("VITE_SMART_DOC_API_KEY", ""); // 默认无 key，隔离真实 .env 的影响
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

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

test("listBatches 请求列表并解析", async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [mockBatch] });
  const res = await listBatches();
  expect(fetchMock).toHaveBeenCalledWith("/api/batches");
  expect(res[0].batch_no).toBe("B-2026-01");
});

test("createBatch 发 POST 带 JSON body 和 authHeaders", async () => {
  vi.stubEnv("VITE_SMART_DOC_API_KEY", "test-key");
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => mockBatch });
  await createBatch({ batch_no: "B-2026-01", declare_period: "2026.03–2026.05" });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/batches");
  expect(init.method).toBe("POST");
  expect(init.headers["Content-Type"]).toBe("application/json");
  expect(init.headers["X-API-Key"]).toBe("test-key");
  expect(JSON.parse(init.body)).toEqual({
    batch_no: "B-2026-01",
    declare_period: "2026.03–2026.05",
  });
});

test("createBatch 无 key 时不带 X-API-Key", async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => mockBatch });
  await createBatch({ batch_no: "B-2026-01" });
  const [, init] = fetchMock.mock.calls[0];
  expect(init.headers).not.toHaveProperty("X-API-Key");
});

test("createBatch 422 时抛错含状态码", async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 422,
    statusText: "Unprocessable Entity",
    text: async () => "批次号已存在",
  });
  await expect(createBatch({ batch_no: "DUP" })).rejects.toThrow(/422/);
});

test("getBatchDetail 发 GET 到 /api/batches/:id", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ...mockBatch, rule_docs: [] }),
  });
  const res = await getBatchDetail(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/batches/1");
  expect(res.rule_docs).toEqual([]);
  expect(res.batch_no).toBe("B-2026-01");
});

test("bindRuleDocs 发 POST 带 JSON body 和 authHeaders", async () => {
  vi.stubEnv("VITE_SMART_DOC_API_KEY", "key");
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ bound_count: 2 }),
  });
  const res = await bindRuleDocs(1, [3, 5]);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/batches/1/bind-rule-docs");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ standard_doc_ids: [3, 5] });
  expect(init.headers["X-API-Key"]).toBe("key");
  expect(res.bound_count).toBe(2);
});

test("listBatchStandardDocs 发 GET 到 /api/batches/:id/standard-docs", async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
  await listBatchStandardDocs(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/batches/1/standard-docs");
});

test("listBatchPackages 发 GET 到 /api/batches/:id/packages", async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
  await listBatchPackages(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/batches/1/packages");
});
