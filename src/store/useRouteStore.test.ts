import { useRouteStore } from "./useRouteStore";

beforeEach(() => {
  useRouteStore.setState({ route: "home" });
});

test("默认路由是 home", () => {
  expect(useRouteStore.getState().route).toBe("home");
});

test("setRoute 切换当前路由", () => {
  useRouteStore.getState().setRoute("review-new");
  expect(useRouteStore.getState().route).toBe("review-new");
});
