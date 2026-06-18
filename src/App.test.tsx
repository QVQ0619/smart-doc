import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { useRouteStore } from "./store/useRouteStore";

// 隔离右栏 ChatPanel 的真实依赖，聚焦路由切换
vi.mock("./layout/ChatPanel", () => ({
  default: () => <div data-testid="chat-panel-stub" />,
}));

beforeEach(() => {
  useRouteStore.setState({ route: "home" });
});

test("默认渲染工作台页", async () => {
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "工作台" }),
  ).toBeInTheDocument();
});

test("点击菜单切换中间页", async () => {
  render(<App />);
  await userEvent.click(screen.getByText("审查报告"));
  expect(
    await screen.findByRole("heading", { name: "审查报告" }),
  ).toBeInTheDocument();
});
