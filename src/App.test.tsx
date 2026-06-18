import { render, screen } from "@testing-library/react";
import App from "./App";

test("App 渲染根节点", () => {
  render(<App />);
  expect(screen.getByTestId("app-root")).toBeInTheDocument();
});
