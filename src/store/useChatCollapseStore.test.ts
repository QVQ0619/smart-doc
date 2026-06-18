import { useChatCollapseStore } from "./useChatCollapseStore";

beforeEach(() => {
  localStorage.clear();
  useChatCollapseStore.setState({ collapsed: false });
});

test("toggle 切换折叠态并写入 localStorage", () => {
  useChatCollapseStore.getState().toggle();
  expect(useChatCollapseStore.getState().collapsed).toBe(true);
  expect(localStorage.getItem("chat-panel-collapsed")).toBe("1");
  useChatCollapseStore.getState().toggle();
  expect(useChatCollapseStore.getState().collapsed).toBe(false);
  expect(localStorage.getItem("chat-panel-collapsed")).toBe("0");
});
