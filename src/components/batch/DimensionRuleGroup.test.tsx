import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DimensionRuleGroup from "./DimensionRuleGroup";
import * as api from "../../api/standardDocs";
import type { Rule } from "../../api/standardDocs";

vi.mock("../../api/standardDocs", async () => {
  const actual = await vi.importActual<typeof api>("../../api/standardDocs");
  return {
    ...actual,
    updateRule: vi.fn(),
    deleteRule: vi.fn(),
  };
});

function makeRule(overrides: Partial<Rule>): Rule {
  return {
    id: 1,
    rule_code: "R-001",
    version: "V1.0",
    name: "规则默认",
    logic: null,
    dimension_code: "completeness",
    dimension_name: "完整性",
    decision_type: "hard",
    disposition: "reject",
    binding_class: "common",
    source_clause_id: null,
    clause_no: null,
    clause_text: null,
    page_no: null,
    locator: null,
    ...overrides,
  };
}

const rules: Rule[] = [
  makeRule({ id: 1, name: "规则A完整性硬性", dimension_code: "completeness", decision_type: "hard" }),
  makeRule({ id: 2, name: "规则B完整性建议", dimension_code: "completeness", decision_type: "soft" }),
  makeRule({ id: 3, name: "规则C合规性核验", dimension_code: "compliance", decision_type: "verify" }),
];

function renderGroup(ruleList = rules) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DimensionRuleGroup rules={ruleList} docId={1} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.deleteRule).mockResolvedValue(undefined);
  vi.mocked(api.updateRule).mockResolvedValue({} as never);
});

test("初始渲染显示全部规则（全部筛选器）", () => {
  renderGroup();
  expect(screen.getByText("规则A完整性硬性")).toBeInTheDocument();
  expect(screen.getByText("规则B完整性建议")).toBeInTheDocument();
  expect(screen.getByText("规则C合规性核验")).toBeInTheDocument();
});

test("chip 显示维度名称和计数", () => {
  renderGroup();
  expect(screen.getByTestId("chip-all")).toHaveTextContent("全部");
  expect(screen.getByTestId("chip-completeness")).toHaveTextContent("完整性");
  expect(screen.getByTestId("chip-compliance")).toHaveTextContent("合规性");
});

test("点击「合规性」chip 只显示合规性规则", async () => {
  renderGroup();
  await userEvent.click(screen.getByTestId("chip-compliance"));
  expect(screen.queryByText("规则A完整性硬性")).not.toBeInTheDocument();
  expect(screen.queryByText("规则B完整性建议")).not.toBeInTheDocument();
  expect(screen.getByText("规则C合规性核验")).toBeInTheDocument();
});

test("点击维度 chip 后点「全部」恢复所有规则", async () => {
  renderGroup();
  await userEvent.click(screen.getByTestId("chip-compliance"));
  await userEvent.click(screen.getByTestId("chip-all"));
  expect(screen.getByText("规则A完整性硬性")).toBeInTheDocument();
  expect(screen.getByText("规则B完整性建议")).toBeInTheDocument();
  expect(screen.getByText("规则C合规性核验")).toBeInTheDocument();
});

test("hard 判定规则显示「硬性」标签", () => {
  renderGroup();
  expect(screen.getAllByText("硬性").length).toBeGreaterThan(0);
});

test("soft 判定规则显示「建议」标签", () => {
  renderGroup();
  expect(screen.getByText("建议")).toBeInTheDocument();
});

test("verify 判定规则显示「需核验」标签", () => {
  renderGroup();
  expect(screen.getByText("需核验")).toBeInTheDocument();
});

test("点击「编辑」弹出编辑规则 Modal", async () => {
  renderGroup();
  // 第一个编辑按钮
  const editBtns = screen.getAllByRole("button", { name: "编辑" });
  await userEvent.click(editBtns[0]);
  expect(await screen.findByText("编辑规则")).toBeInTheDocument();
});

test("保存编辑调用 updateRule", async () => {
  renderGroup();
  const editBtns = screen.getAllByRole("button", { name: "编辑" });
  await userEvent.click(editBtns[0]);
  await screen.findByText("编辑规则");
  await userEvent.click(screen.getByRole("button", { name: /保.?存/ }));
  await waitFor(() => expect(vi.mocked(api.updateRule)).toHaveBeenCalled());
});

test("确认删除调用 deleteRule", async () => {
  renderGroup();
  const deleteBtns = screen.getAllByRole("button", { name: "删除" });
  await userEvent.click(deleteBtns[0]);
  await userEvent.click(await screen.findByRole("button", { name: /确.?定/ }));
  await waitFor(() => expect(vi.mocked(api.deleteRule)).toHaveBeenCalledWith(1, 1));
});

test("空规则数组不渲染任何卡片", () => {
  renderGroup([]);
  expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
});
