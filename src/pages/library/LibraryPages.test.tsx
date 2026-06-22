import { render, screen } from "@testing-library/react";
import RuleLibraryPage from "./RuleLibraryPage";
import DocArchivePage from "./DocArchivePage";

vi.mock("../../components/StandardDocLibrary", () => ({
  default: () => <div data-testid="std-doc-lib" />,
}));

test("规则库页渲染 StandardDocLibrary", () => {
  render(<RuleLibraryPage />);
  expect(screen.getByTestId("std-doc-lib")).toBeInTheDocument();
});

test("审查文档库页显示申请材料待接入说明", () => {
  render(<DocArchivePage />);
  expect(screen.getByText(/申报批次/)).toBeInTheDocument();
});
