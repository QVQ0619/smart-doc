import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  listStandardDocs,
  uploadStandardDocs,
  deleteStandardDoc,
  downloadStandardDocUrl,
  recognizeStandardDoc,
  listClauses,
  updateClause,
  deleteClause,
  updateRule,
  deleteRule,
} from "./standardDocs";

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

test("listStandardDocs 请求列表并解析", async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [{ id: 1 }] });
  const res = await listStandardDocs();
  expect(fetchMock).toHaveBeenCalledWith("/api/standard-docs");
  expect(res).toEqual([{ id: 1 }]);
});

test("uploadStandardDocs 以 FormData 提交多文件", async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ uploaded: [], failed: [] }) });
  const f1 = new File(["a"], "a.txt");
  const f2 = new File(["b"], "b.txt");
  await uploadStandardDocs([f1, f2]);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/standard-docs");
  expect(init.method).toBe("POST");
  expect((init.body as FormData).getAll("files")).toHaveLength(2);
});

test("deleteStandardDoc 发 DELETE", async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 204 });
  await deleteStandardDoc(7);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/standard-docs/7");
  expect(init.method).toBe("DELETE");
  expect(init.headers).not.toHaveProperty("X-API-Key"); // 未配 key 时不带
});

test("downloadStandardDocUrl 返回地址", () => {
  expect(downloadStandardDocUrl(5)).toBe("/api/standard-docs/5/download");
});

test("非 2xx 抛错", async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: "err", text: async () => "boom" });
  await expect(listStandardDocs()).rejects.toThrow(/500/);
});

test("recognizeStandardDoc 发 POST 到识别接口", async () => {
  fetchMock.mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({ doc_id: 3, doc_code: "SD-x", recognition_status: "done", segment_count: 7, page_count: 2, error: null }),
  });
  const res = await recognizeStandardDoc(3);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/standard-docs/3/recognize");
  expect(init.method).toBe("POST");
  expect(init.headers).not.toHaveProperty("X-API-Key"); // 未配 key 时不带
  expect(res.segment_count).toBe(7);
});

test("listClauses 发 GET 到条款接口", async () => {
  fetchMock.mockResolvedValue({
    ok: true, status: 200,
    json: async () => [{ id: 1, clause_no: "第一条", clause_text: "x", source_segment_id: 5, page_no: 2, locator: { page: 2, block_index: 1 } }],
  });
  const res = await listClauses(9);
  expect(fetchMock).toHaveBeenCalledWith("/api/standard-docs/9/clauses");
  expect(res[0].clause_no).toBe("第一条");
});

test("updateClause 发 PATCH 带 JSON body", async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 3, clause_no: "第二条" }) });
  await updateClause(9, 3, { clause_no: "第二条", clause_text: "新" });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/standard-docs/9/clauses/3");
  expect(init.method).toBe("PATCH");
  expect(JSON.parse(init.body)).toEqual({ clause_no: "第二条", clause_text: "新" });
  expect(init.headers["Content-Type"]).toBe("application/json");
});

test("deleteClause 发 DELETE", async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 204 });
  await deleteClause(9, 3);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/standard-docs/9/clauses/3");
  expect(init.method).toBe("DELETE");
});

test("updateRule 发 PATCH 带 JSON body", async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 5, name: "规则B" }) });
  await updateRule(9, 5, {
    name: "规则B", logic: null, dimension_code: "rationality",
    decision_type: "verify", disposition: "fix", binding_class: "parameterized",
  });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/standard-docs/9/rules/5");
  expect(init.method).toBe("PATCH");
  expect(JSON.parse(init.body).dimension_code).toBe("rationality");
});

test("deleteRule 发 DELETE", async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 204 });
  await deleteRule(9, 5);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/standard-docs/9/rules/5");
  expect(init.method).toBe("DELETE");
});
