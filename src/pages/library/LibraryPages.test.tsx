import { render, screen } from "@testing-library/react";
import RuleLibraryPage from "./RuleLibraryPage";
import DocArchivePage from "./DocArchivePage";
import ConfigPacksPage from "./ConfigPacksPage";

vi.mock("../../components/StandardDocLibrary", () => ({
  default: () => <div data-testid="std-doc-lib" />,
}));

vi.mock("../../components/ConfigPackageLibrary", () => ({
  default: () => <div data-testid="config-pkg-lib" />,
}));

vi.mock("../../components/MaterialLibrary", () => ({ default: () => <div data-testid="material-lib" /> }));

test("规则库页渲染 StandardDocLibrary", () => {
  render(<RuleLibraryPage />);
  expect(screen.getByTestId("std-doc-lib")).toBeInTheDocument();
});

test("审查文档库页渲染 MaterialLibrary", () => {
  render(<DocArchivePage />);
  expect(screen.getByTestId("material-lib")).toBeInTheDocument();
});

test("配置包页渲染 ConfigPackageLibrary", () => {
  render(<ConfigPacksPage />);
  expect(screen.getByTestId("config-pkg-lib")).toBeInTheDocument();
});
