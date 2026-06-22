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
};

beforeEach(() => {
  vi.mocked(api.listStandardDocs).mockResolvedValue([sample] as never);
  vi.mocked(api.uploadStandardDocs).mockResolvedValue({ uploaded: [sample], failed: [] } as never);
  vi.mocked(api.deleteStandardDoc).mockResolvedValue();
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
