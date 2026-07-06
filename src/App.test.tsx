import { render, screen } from "@testing-library/react";
import App from "./App";
import { useRouteStore } from "./store/useRouteStore";
import { useAuthStore } from "./store/useAuthStore";

// 隔离右栏 ChatPanel 的真实依赖，聚焦路由切换
vi.mock("./layout/ChatPanel", () => ({
  default: () => <div data-testid="chat-panel-stub" />,
}));

// 隔离 DashboardPage 的统计接口依赖，聚焦路由切换
vi.mock("./pages/dashboard/DashboardPage", () => ({
  default: () => <div data-testid="dashboard-page" />,
}));

// 隔离 BatchListPage 的 QueryClient 依赖，聚焦路由切换
vi.mock("./pages/batch/BatchListPage", () => ({
  default: () => <div data-testid="batch-list-page" />,
}));

// 隔离 BatchDetailPage 的 QueryClient 依赖，聚焦路由切换
vi.mock("./pages/batch/BatchDetailPage", () => ({
  default: ({ batchId }: { batchId: number }) => (
    <div data-testid="batch-detail-page">批次详情 #{batchId}</div>
  ),
}));

// 隔离 RuleDetailPage 的 QueryClient / Blade SDK 依赖，聚焦路由切换
vi.mock("./pages/batch/RuleDetailPage", () => ({
  default: ({ docId }: { docId: number }) => (
    <div data-testid="rule-detail-page">规则详情 #{docId}</div>
  ),
}));

// 隔离 RuleLibraryPage 的真实依赖，聚焦路由切换
vi.mock("./pages/library/RuleLibraryPage", () => ({
  default: () => <div data-testid="rule-library-page" />,
}));

beforeEach(() => {
  useRouteStore.setState({ nav: { name: "dashboard" } });
  // App 有登录门:未登录渲染 LoginPage。测试统一以已登录评审专家身份进入。
  useAuthStore.setState({
    token: "t",
    user: { id: 2, username: "reviewer1", display_name: "评审专家一", roles: ["reviewer"], primary_role: "reviewer" },
    isAdmin: false,
  });
});

test("默认渲染仪表盘页", async () => {
  render(<App />);
  expect(await screen.findByTestId("dashboard-page")).toBeInTheDocument();
});

test("nav 为 batch-list 渲染项目批次页", async () => {
  useRouteStore.setState({ nav: { name: "batch-list" } });
  render(<App />);
  expect(await screen.findByTestId("batch-list-page")).toBeInTheDocument();
});

test("nav 为 batch-detail 渲染批次详情页含 id", async () => {
  useRouteStore.setState({ nav: { name: "batch-detail", batchId: 3, batchTitle: "甲" } });
  render(<App />);
  const el = await screen.findByTestId("batch-detail-page");
  expect(el).toBeInTheDocument();
  expect(el.textContent).toContain("#3");
});

test("nav 为 rule-detail 渲染规则详情页含 docId", async () => {
  useRouteStore.setState({
    nav: { name: "rule-detail", docId: 5, docTitle: "政策A", batchId: 3, batchTitle: "甲" },
  });
  render(<App />);
  const el = await screen.findByTestId("rule-detail-page");
  expect(el).toBeInTheDocument();
  expect(el.textContent).toContain("#5");
});

test("nav 为 rule-library 渲染规则库页", async () => {
  useRouteStore.setState({ nav: { name: "rule-library" } });
  render(<App />);
  expect(await screen.findByTestId("rule-library-page")).toBeInTheDocument();
});
