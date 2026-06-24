import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ConfigPackageLibrary from "./ConfigPackageLibrary";
import * as pkgApi from "../api/configPackages";
import * as docApi from "../api/standardDocs";

vi.mock("../api/configPackages", async () => {
  const actual = await vi.importActual<typeof pkgApi>("../api/configPackages");
  return { ...actual, listConfigPackages: vi.fn() };
});
vi.mock("../api/standardDocs", async () => {
  const actual = await vi.importActual<typeof docApi>("../api/standardDocs");
  return { ...actual, listRules: vi.fn() };
});

function renderLib() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ConfigPackageLibrary />
    </QueryClientProvider>,
  );
}

const pkg = { doc_id: 3, doc_code: "SD-x", title: "申请规定", version: "V1.0", rule_count: 1, dimensions: ["合规性"] };

beforeEach(() => {
  vi.mocked(pkgApi.listConfigPackages).mockResolvedValue([pkg] as never);
  vi.mocked(docApi.listRules).mockResolvedValue([
    {
      id: 1, rule_code: "RULE-a", version: "V1.0", name: "同年限申请1项", logic: null,
      dimension_code: "compliance", dimension_name: "合规性", decision_type: "hard",
      disposition: "reject", binding_class: "common", source_clause_id: 9, clause_no: "二",
      clause_text: "x", page_no: 5, locator: { page: 5, block_index: 0 },
    },
  ] as never);
});

test("渲染配置包列表（名称/编码/维度）", async () => {
  renderLib();
  expect(await screen.findByText("申请规定")).toBeInTheDocument();
  expect(screen.getByText("SD-x")).toBeInTheDocument();
  expect(screen.getByText("合规性")).toBeInTheDocument();
});

test("展开配置包行只读列出规则与出处", async () => {
  const { container } = renderLib();
  await screen.findByText("申请规定");
  const expandBtn = container.querySelector(".ant-table-row-expand-icon") as HTMLElement;
  await userEvent.click(expandBtn);
  await waitFor(() => expect(vi.mocked(docApi.listRules)).toHaveBeenCalledWith(3));
  expect(await screen.findByText("同年限申请1项")).toBeInTheDocument();
  expect(screen.getByText("第5页第1段")).toBeInTheDocument();
});

test("整页无编辑/删除/上传按钮（只读）", async () => {
  renderLib();
  await screen.findByText("申请规定");
  expect(screen.queryByText("编辑")).not.toBeInTheDocument();
  expect(screen.queryByText("删除")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /上传/ })).not.toBeInTheDocument();
});

test("无配置包时显示空状态文案", async () => {
  vi.mocked(pkgApi.listConfigPackages).mockResolvedValue([] as never);
  renderLib();
  expect(await screen.findByText(/暂无配置包/)).toBeInTheDocument();
});
