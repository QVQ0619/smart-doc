import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SideMenu from "./SideMenu";
import { useRouteStore } from "../store/useRouteStore";

beforeEach(() => {
  useRouteStore.setState({ route: "home" });
});

test("渲染品牌名与全部菜单项", () => {
  render(<SideMenu />);
  expect(screen.getByText("立项审查AI辅助系统")).toBeInTheDocument();
  for (const label of [
    "工作台",
    "新建审查",
    "审查任务",
    "审查报告",
    "规则库",
    "配置包",
    "审查文档库",
    "关于流程",
  ]) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
});

test("点击菜单项更新路由 store", async () => {
  render(<SideMenu />);
  await userEvent.click(screen.getByText("新建审查"));
  expect(useRouteStore.getState().route).toBe("review-new");
});
