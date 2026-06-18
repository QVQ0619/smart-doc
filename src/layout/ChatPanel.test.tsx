import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// mock agent-kit 子模块，避免真实网络/socket
vi.mock("@blade-hq/agent-kit/chat", () => ({
  ChatView: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="chatview">session:{sessionId}</div>
  ),
}));
vi.mock("@blade-hq/agent-kit/react", () => ({
  BladeClientProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useSessionStore: { getState: () => ({ setActiveSession: vi.fn() }) },
}));

const createSession = vi.fn().mockResolvedValue({ session_id: "s-123" });
vi.mock("../blade/client", () => ({
  bladeClient: { sessions: { createSession: (...a: unknown[]) => createSession(...a) } },
}));

const hasToken = vi.fn();
vi.mock("../blade/config", () => ({
  hasToken: () => hasToken(),
  getSolutionId: () => undefined,
  getBizRoleId: () => undefined,
}));

import ChatPanel from "./ChatPanel";

beforeEach(() => {
  createSession.mockClear();
});

test("未配置 token 时显示提示，不建会话", () => {
  hasToken.mockReturnValue(false);
  render(<ChatPanel />);
  expect(screen.getByText(/未配置/)).toBeInTheDocument();
  expect(createSession).not.toHaveBeenCalled();
});

test("已配置 token 时自动建会话并渲染 ChatView", async () => {
  hasToken.mockReturnValue(true);
  render(<ChatPanel />);
  await waitFor(() =>
    expect(screen.getByTestId("chatview")).toHaveTextContent("session:s-123"),
  );
  expect(createSession).toHaveBeenCalledTimes(1);
});

test("点击新建会话按钮再次建会话", async () => {
  hasToken.mockReturnValue(true);
  render(<ChatPanel />);
  await waitFor(() => expect(screen.getByTestId("chatview")).toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: /新建会话/ }));
  await waitFor(() => expect(createSession).toHaveBeenCalledTimes(2));
});
