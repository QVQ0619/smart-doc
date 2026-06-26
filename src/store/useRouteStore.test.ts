import { useRouteStore } from "./useRouteStore";

beforeEach(() => {
  useRouteStore.setState({ nav: { name: "home" } });
});

test("默认 nav.name 是 home", () => {
  expect(useRouteStore.getState().nav.name).toBe("home");
});

test("navigate 切换简单路由", () => {
  useRouteStore.getState().navigate({ name: "review-new" });
  expect(useRouteStore.getState().nav.name).toBe("review-new");
});

test("navigate 携参 batch-detail", () => {
  useRouteStore.getState().navigate({ name: "batch-detail", batchId: 7, batchTitle: "X" });
  const nav = useRouteStore.getState().nav;
  expect(nav.name).toBe("batch-detail");
  if (nav.name === "batch-detail") {
    expect(nav.batchId).toBe(7);
  }
});
