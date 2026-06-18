import { render, screen } from "@testing-library/react";
import AppShell from "./AppShell";

test("AppShell 渲染三栏插槽", () => {
  render(
    <AppShell
      menu={<div>菜单区</div>}
      main={<div>工作区</div>}
      chat={<div>对话区</div>}
    />,
  );
  expect(screen.getByTestId("shell-menu")).toHaveTextContent("菜单区");
  expect(screen.getByTestId("shell-main")).toHaveTextContent("工作区");
  expect(screen.getByTestId("shell-chat")).toHaveTextContent("对话区");
});
