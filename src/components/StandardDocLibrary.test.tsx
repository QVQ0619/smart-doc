import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StandardDocLibrary from "./StandardDocLibrary";
import * as api from "../api/standardDocs";

vi.mock("../api/standardDocs", async () => {
  const actual = await vi.importActual<typeof api>("../api/standardDocs");
  return {
    ...actual,
    listStandardDocs: vi.fn(),
    uploadStandardDocs: vi.fn(),
    deleteStandardDoc: vi.fn(),
    recognizeStandardDoc: vi.fn(),
    listClauses: vi.fn(),
  };
});

function renderLib() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StandardDocLibrary />
    </QueryClientProvider>,
  );
}

const sample = {
  id: 1, doc_code: "SD-abc", title: "政策A",
  file_name: "政策A.pdf", size_bytes: 2048, mime_type: "application/pdf", created_at: "2026-06-18T00:00:00Z",
  recognition_status: "done",
};

beforeEach(() => {
  vi.mocked(api.listStandardDocs).mockResolvedValue([sample] as never);
  vi.mocked(api.uploadStandardDocs).mockResolvedValue({ uploaded: [sample], failed: [] } as never);
  vi.mocked(api.deleteStandardDoc).mockResolvedValue();
  vi.mocked(api.recognizeStandardDoc).mockResolvedValue({
    doc_id: 1, doc_code: "SD-abc", recognition_status: "done", segment_count: 9, page_count: 2, error: null,
  } as never);
  vi.mocked(api.listClauses).mockResolvedValue([
    { id: 1, clause_no: "第一条", clause_text: "申请人应当具有高级职称。", source_segment_id: 5, page_no: 2, locator: { page: 2, block_index: 1 } },
  ] as never);
});

test("渲染列表中的规则文件标题", async () => {
  renderLib();
  expect(await screen.findByText("政策A")).toBeInTheDocument();
});

test("选择文件触发上传", async () => {
  const { container } = renderLib();
  await screen.findByText("政策A");
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["data"], "new.txt", { type: "text/plain" });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(vi.mocked(api.uploadStandardDocs)).toHaveBeenCalledWith([file]));
});

test("删除经确认调用 deleteStandardDoc", async () => {
  renderLib();
  await screen.findByText("政策A");
  await userEvent.click(screen.getByRole("button", { name: "删除" }));
  await userEvent.click(await screen.findByRole("button", { name: /确.?定/ }));
  await waitFor(() => expect(vi.mocked(api.deleteStandardDoc)).toHaveBeenCalledWith(1));
});

test("显示识别状态徽标", async () => {
  renderLib();
  expect(await screen.findByText("已识别")).toBeInTheDocument();
});

test("点重新识别调用 recognizeStandardDoc", async () => {
  renderLib();
  await screen.findByText("政策A");
  await userEvent.click(screen.getByRole("button", { name: "重新识别" }));
  await waitFor(() => expect(vi.mocked(api.recognizeStandardDoc)).toHaveBeenCalledWith(1));
});

test("展开文档行显示抽取的条款与出处", async () => {
  const { container } = renderLib();
  await screen.findByText("政策A");
  const expandBtn = container.querySelector(".ant-table-row-expand-icon") as HTMLElement;
  await userEvent.click(expandBtn);
  expect(await screen.findByText("第一条")).toBeInTheDocument();
  expect(await screen.findByText("申请人应当具有高级职称。")).toBeInTheDocument();
  expect(await screen.findByText(/第2页/)).toBeInTheDocument();
});

test("规则库页挂载时每 10 秒轮询刷新列表", async () => {
  vi.useFakeTimers();
  try {
    vi.clearAllMocks();
    renderLib();
    // 刷新初始 microtask, 让首次 fetch 落地
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(api.listStandardDocs)).toHaveBeenCalledTimes(1);
    // 前进 10s 触发轮询
    await vi.advanceTimersByTimeAsync(10000);
    expect(vi.mocked(api.listStandardDocs)).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});
