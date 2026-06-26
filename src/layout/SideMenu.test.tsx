import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SideMenu from "./SideMenu";
import { useRouteStore } from "../store/useRouteStore";

beforeEach(() => {
  useRouteStore.setState({ nav: { name: "home" } });
});

test("渲染品牌名与全部菜单项", async () => {
  render(<SideMenu />);
  await waitFor(() => expect(screen.getByText("立项审查AI辅助系统")).toBeInTheDocument());
  for (const label of [
    "工作台",
    "新建审查",
    "审查任务",
    "审查报告",
    "项目批次",
    "关于流程",
  ]) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
});

test("点击菜单项更新 nav store", async () => {
  render(<SideMenu />);
  await userEvent.click(screen.getByText("项目批次"));
  await waitFor(() => expect(useRouteStore.getState().nav.name).toBe("batch-list"));
});
