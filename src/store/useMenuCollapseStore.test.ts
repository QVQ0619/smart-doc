import { useMenuCollapseStore } from "./useMenuCollapseStore";

beforeEach(() => {
  localStorage.clear();
  useMenuCollapseStore.setState({ collapsed: false });
});

test("初始状态读取 localStorage（无值时默认 false）", () => {
  expect(useMenuCollapseStore.getState().collapsed).toBe(false);
});

test("toggle 切换折叠态并写入 localStorage", () => {
  useMenuCollapseStore.getState().toggle();
  expect(useMenuCollapseStore.getState().collapsed).toBe(true);
  expect(localStorage.getItem("side-menu-collapsed")).toBe("1");
  useMenuCollapseStore.getState().toggle();
  expect(useMenuCollapseStore.getState().collapsed).toBe(false);
  expect(localStorage.getItem("side-menu-collapsed")).toBe("0");
});
