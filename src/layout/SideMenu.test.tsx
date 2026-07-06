import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SideMenu from "./SideMenu";
import { useRouteStore } from "../store/useRouteStore";
import { useAuthStore } from "../store/useAuthStore";
import { useMenuCollapseStore } from "../store/useMenuCollapseStore";

const reviewer = {
  id: 2,
  username: "reviewer1",
  display_name: "评审专家一",
  roles: ["reviewer"],
  primary_role: "reviewer",
};

beforeEach(() => {
  useRouteStore.setState({ nav: { name: "my-tasks" } });
  useMenuCollapseStore.setState({ collapsed: false });
  useAuthStore.setState({ token: "t", user: reviewer, isAdmin: false });
});

test("渲染品牌名与评审专家全部菜单项", () => {
  render(<SideMenu />);
  expect(screen.getByText("装备研制立项AI辅助审查评估系统")).toBeInTheDocument();
  for (const label of [
    "仪表盘",
    "立项论证审查",
    "指标专项检验",
    "审查意见研判",
    "审查报告生成",
    "审查台账",
    "关于流程",
  ]) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
  // 管理员专属项对评审专家不可见
  expect(screen.queryByText("任务管理")).not.toBeInTheDocument();
  expect(screen.queryByText("规则库")).not.toBeInTheDocument();
});

test("管理员可见任务管理与规则库", () => {
  useAuthStore.setState({
    token: "t",
    user: { ...reviewer, username: "admin", display_name: "系统管理员", roles: ["sys_admin"] },
    isAdmin: true,
  });
  render(<SideMenu />);
  expect(screen.getByText("任务管理")).toBeInTheDocument();
  expect(screen.getByText("规则库")).toBeInTheDocument();
});

test("点击菜单项更新 nav store", async () => {
  render(<SideMenu />);
  await userEvent.click(screen.getByText("审查台账"));
  await waitFor(() => expect(useRouteStore.getState().nav.name).toBe("review-ledger"));
});

test("折叠态渲染展开按钮与迷你品牌", () => {
  useMenuCollapseStore.setState({ collapsed: true });
  render(<SideMenu />);
  expect(screen.getByLabelText("展开菜单")).toBeInTheDocument();
  expect(screen.getByText("审")).toBeInTheDocument();
});
