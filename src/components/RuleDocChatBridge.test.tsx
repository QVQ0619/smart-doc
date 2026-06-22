import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RuleDocChatBridge from "./RuleDocChatBridge";

const { send, uploadFiles } = vi.hoisted(() => ({ send: vi.fn(), uploadFiles: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }));

vi.mock("@blade-hq/agent-kit/react", () => ({
  uploadFiles: (...a: unknown[]) => uploadFiles(...a),
  useChat: () => ({ send }),
  buildMessageContent: (text: string, _attachments: unknown[]) => ({ text }),
}));

const uploadStandardDocs = vi.hoisted(() => vi.fn());
vi.mock("../api/standardDocs", () => ({
  uploadStandardDocs: (...a: unknown[]) => uploadStandardDocs(...a),
}));

vi.mock("sonner", () => ({ toast }));

beforeEach(() => {
  send.mockReset();
  uploadFiles.mockReset().mockResolvedValue({ uploaded: ["uploads/政策A.pdf"], failed: [] });
  uploadStandardDocs.mockReset().mockResolvedValue({
    uploaded: [
      { id: 1, doc_code: "SD-abc", title: "政策A", file_name: "政策A.pdf", size_bytes: 10, mime_type: "application/pdf", created_at: null },
    ],
    failed: [],
  });
  toast.success.mockReset();
  toast.warning.mockReset();
  toast.error.mockReset();
});

function pick(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

test("选文件 → 传 sandbox 并发消息让 AI 看", async () => {
  const { container } = render(<RuleDocChatBridge sessionId="s-1" />);
  const file = new File(["x"], "政策A.pdf", { type: "application/pdf" });
  pick(container, file);
  await waitFor(() => expect(uploadFiles).toHaveBeenCalledWith("s-1", "uploads", [file]));
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toEqual({ text: expect.stringContaining("政策A.pdf") });
});

test("点存入规则库 → 调本地入库 + 成功 toast", async () => {
  const { container } = render(<RuleDocChatBridge sessionId="s-1" />);
  const file = new File(["x"], "政策A.pdf", { type: "application/pdf" });
  pick(container, file);
  await screen.findByText(/已选：政策A.pdf/);
  await userEvent.click(screen.getByRole("button", { name: "存入规则库" }));
  await waitFor(() => expect(uploadStandardDocs).toHaveBeenCalledWith([file]));
  await waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("SD-abc")),
  );
});

test("传 sandbox 失败仍能存入规则库（解耦）", async () => {
  uploadFiles.mockRejectedValue(new Error("sandbox down"));
  const { container } = render(<RuleDocChatBridge sessionId="s-1" />);
  const file = new File(["x"], "政策A.pdf", { type: "application/pdf" });
  pick(container, file);
  await waitFor(() => expect(toast.warning).toHaveBeenCalled());
  await userEvent.click(screen.getByRole("button", { name: "存入规则库" }));
  await waitFor(() => expect(uploadStandardDocs).toHaveBeenCalledWith([file]));
  expect(toast.success).toHaveBeenCalled();
});
