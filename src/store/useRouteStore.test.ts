import { useRouteStore } from "./useRouteStore";

beforeEach(() => {
  useRouteStore.setState({ nav: { name: "my-tasks" } });
});

test("默认 nav.name 是 dashboard", () => {
  // beforeEach 已改写运行时 state,这里取 store 初始快照校验默认路由
  expect(useRouteStore.getInitialState().nav.name).toBe("dashboard");
});

test("navigate 切换简单路由", () => {
  useRouteStore.getState().navigate({ name: "task-manage" });
  expect(useRouteStore.getState().nav.name).toBe("task-manage");
});

test("navigate 携参 batch-detail", () => {
  useRouteStore.getState().navigate({ name: "batch-detail", batchId: 7, batchTitle: "X" });
  const nav = useRouteStore.getState().nav;
  expect(nav.name).toBe("batch-detail");
  if (nav.name === "batch-detail") {
    expect(nav.batchId).toBe(7);
  }
});
