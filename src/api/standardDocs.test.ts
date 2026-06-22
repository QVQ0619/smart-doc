import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  listStandardDocs,
  uploadStandardDocs,
  deleteStandardDoc,
  downloadStandardDocUrl,
  recognizeStandardDoc,
} from "./standardDocs";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

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
  expect(fetchMock).toHaveBeenCalledWith("/api/standard-docs/7", { method: "DELETE" });
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
  expect(fetchMock).toHaveBeenCalledWith("/api/standard-docs/3/recognize", { method: "POST" });
  expect(res.segment_count).toBe(7);
});
