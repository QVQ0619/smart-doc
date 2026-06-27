import { render, screen } from "@testing-library/react";
import SideMenu from "./SideMenu";
import { useMenuCollapseStore } from "../store/useMenuCollapseStore";

beforeEach(() => {
  useMenuCollapseStore.setState({ collapsed: false });
});

test("侧边菜单『资源』组含『规则库』项", () => {
  render(<SideMenu />);
  expect(screen.getByText("规则库")).toBeInTheDocument();
  expect(screen.getByText("项目批次")).toBeInTheDocument();
});
