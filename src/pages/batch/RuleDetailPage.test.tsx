import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RuleDetailPage from "./RuleDetailPage";
import * as api from "../../api/standardDocs";
import { useRouteStore } from "../../store/useRouteStore";
import { toast } from "sonner";

// ===== Blade SDK mock（与 StandardDocLibrary.test.tsx 同构）=====
const mockSend = vi.hoisted(() => vi.fn());
const _bladeState = vi.hoisted(() => ({
  activeSessionId: "session-abc" as string | null,
}));

vi.mock("@blade-hq/agent-kit/react", () => ({
  useSessionStore: (selector: (s: { activeSessionId: string | null }) => unknown) =>
    selector({ activeSessionId: _bladeState.activeSessionId }),
  useChat: (_sessionId: string) => ({
    send: mockSend,
    messages: [],
    isStreaming: false,
    isStopping: false,
    stop: () => Promise.resolve(),
  }),
}));

// ===== API mock =====
vi.mock("../../api/standardDocs", async () => {
  const actual = await vi.importActual<typeof api>("../../api/standardDocs");
  return {
    ...actual,
    listStandardDocs: vi.fn(),
    listRules: vi.fn(),
    listClauses: vi.fn(),
    recognizeStandardDoc: vi.fn(),
    downloadStandardDocUrl: vi.fn((id: number) => `/api/standard-docs/${id}/download`),
    updateRule: vi.fn(),
    deleteRule: vi.fn(),
    updateClause: vi.fn(),
    deleteClause: vi.fn(),
  };
});

// ===== 样本数据 =====
const sampleDoc = {
  id: 10,
  doc_code: "SD-x",
  title: "国家重点研发计划申报指南",
  file_name: "guide.pdf",
  size_bytes: 1024,
  mime_type: "application/pdf",
  created_at: null,
  recognition_status: "done",
};

const sampleRules = [
  {
    id: 1,
    rule_code: "R-001",
    version: "V1.0",
    name: "申请书须包含完整的预算编制说明",
    logic: "若申请书缺少预算说明章节，则判定不通过",
    dimension_code: "completeness",
    dimension_name: "完整性",
    decision_type: "hard",
    disposition: "reject",
    binding_class: "common",
    source_clause_id: 1,
    clause_no: "第三条",
    clause_text: "...",
    page_no: 3,
    locator: { block_index: 1 },
  },
  {
    id: 2,
    rule_code: "R-002",
    version: "V1.0",
    name: "经费预算总额不得超过限额",
    logic: "经费总额需不超过限额",
    dimension_code: "compliance",
    dimension_name: "合规性",
    decision_type: "verify",
    disposition: "review",
    binding_class: "common",
    source_clause_id: 2,
    clause_no: "第六条",
    clause_text: "...",
    page_no: 6,
    locator: { block_index: 1 },
  },
];

const sampleClauses = [
  {
    id: 1,
    clause_no: "第三条",
    clause_text: "申请人须提交完整材料。",
    source_segment_id: 5,
    page_no: 3,
    locator: { block_index: 1 },
  },
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RuleDetailPage
        docId={10}
        docTitle="国家重点研发计划申报指南"
        batchId={1}
        batchTitle="2026年度国家重点研发计划"
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  _bladeState.activeSessionId = "session-abc";
  // 重置路由至 home，避免测试间干扰
  useRouteStore.setState({ nav: { name: "home" } });

  vi.mocked(api.listStandardDocs).mockResolvedValue([sampleDoc] as never);
  vi.mocked(api.listRules).mockResolvedValue(sampleRules as never);
  vi.mocked(api.listClauses).mockResolvedValue(sampleClauses as never);
  vi.mocked(api.recognizeStandardDoc).mockResolvedValue({
    doc_id: 10,
    doc_code: "SD-x",
    recognition_status: "processing",
    segment_count: 15,
    page_count: 8,
    error: null,
  } as never);
  vi.mocked(api.updateRule).mockResolvedValue({} as never);
  vi.mocked(api.deleteRule).mockResolvedValue(undefined);
  vi.mocked(api.updateClause).mockResolvedValue({} as never);
  vi.mocked(api.deleteClause).mockResolvedValue(undefined);
});

// ===== 面包屑 =====
test("渲染面包屑所有层级", async () => {
  renderPage();
  // 等待异步数据
  await screen.findByText("申请书须包含完整的预算编制说明");
  expect(screen.getByText("项目批次")).toBeInTheDocument();
  expect(screen.getByText("2026年度国家重点研发计划")).toBeInTheDocument();
  expect(screen.getByText("规则库")).toBeInTheDocument();
  // docTitle 作为面包屑末尾（当前页，不是 link）
  const breadcrumbLastItems = screen.getAllByText("国家重点研发计划申报指南");
  expect(breadcrumbLastItems.length).toBeGreaterThan(0);
});

test("面包屑「项目批次」点击导航到 batch-list", async () => {
  renderPage();
  await screen.findByText("规则库");
  await userEvent.click(screen.getByText("项目批次"));
  await waitFor(() => {
    expect(useRouteStore.getState().nav.name).toBe("batch-list");
  });
});

test("面包屑「规则库」点击导航到 batch-detail", async () => {
  renderPage();
  await screen.findByText("规则库");
  await userEvent.click(screen.getByText("规则库"));
  await waitFor(() => {
    const nav = useRouteStore.getState().nav;
    expect(nav.name).toBe("batch-detail");
    if (nav.name === "batch-detail") {
      expect(nav.batchId).toBe(1);
      expect(nav.batchTitle).toBe("2026年度国家重点研发计划");
    }
  });
});

test("面包屑 batchTitle 点击也导航到 batch-detail", async () => {
  renderPage();
  await screen.findByText("规则库");
  await userEvent.click(screen.getByText("2026年度国家重点研发计划"));
  await waitFor(() => {
    expect(useRouteStore.getState().nav.name).toBe("batch-detail");
  });
});

// ===== 头部 =====
test("渲染头部标题和操作按钮", async () => {
  renderPage();
  await screen.findByText("规则库");
  expect(screen.getByRole("button", { name: "查看原文件" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "重新识别并重抽规则" }),
  ).toBeInTheDocument();
});

// ===== 审查规则 Tab =====
test("审查规则 Tab 显示分组规则卡（含两维度）", async () => {
  renderPage();
  expect(await screen.findByText("申请书须包含完整的预算编制说明")).toBeInTheDocument();
  expect(screen.getByText("经费预算总额不得超过限额")).toBeInTheDocument();
});

test("审查规则 Tab 显示维度分组标题（含两个分组容器）", async () => {
  renderPage();
  await screen.findByText("申请书须包含完整的预算编制说明");
  // 使用 data-testid 精确匹配分组容器
  expect(screen.getByTestId("dim-group-completeness")).toBeInTheDocument();
  expect(screen.getByTestId("dim-group-compliance")).toBeInTheDocument();
});

test("规则列表为空时显示空状态提示", async () => {
  vi.mocked(api.listRules).mockResolvedValue([] as never);
  renderPage();
  expect(
    await screen.findByText(/尚未结构化/),
  ).toBeInTheDocument();
});

// ===== 依据条款 Tab =====
test("切换到「依据条款」Tab 显示条款卡", async () => {
  renderPage();
  // 等待页面加载完成
  await screen.findByText("申请书须包含完整的预算编制说明");
  await userEvent.click(screen.getByRole("tab", { name: "依据条款" }));
  expect(await screen.findByText("第三条")).toBeInTheDocument();
  expect(screen.getByText("申请人须提交完整材料。")).toBeInTheDocument();
});

test("条款列表为空时显示空状态提示", async () => {
  vi.mocked(api.listClauses).mockResolvedValue([] as never);
  renderPage();
  await screen.findByText("申请书须包含完整的预算编制说明");
  await userEvent.click(screen.getByRole("tab", { name: "依据条款" }));
  expect(await screen.findByText(/尚未抽取/)).toBeInTheDocument();
});

// ===== 一键重抽逻辑 =====
test("无会话时点「重新识别并重抽规则」只显示警告，不调 API", async () => {
  _bladeState.activeSessionId = null;
  const warnSpy = vi.spyOn(toast, "warning");
  renderPage();
  await screen.findByText("规则库");
  await userEvent.click(screen.getByRole("button", { name: "重新识别并重抽规则" }));
  expect(vi.mocked(api.recognizeStandardDoc)).not.toHaveBeenCalled();
  expect(mockSend).not.toHaveBeenCalled();
  await waitFor(() => expect(warnSpy).toHaveBeenCalledWith("请先在右侧开始对话"));
  warnSpy.mockRestore();
});

test("有会话时点「重新识别并重抽规则」调用 recognizeStandardDoc", async () => {
  renderPage();
  await screen.findByText("规则库");
  await userEvent.click(screen.getByRole("button", { name: "重新识别并重抽规则" }));
  await waitFor(() => expect(vi.mocked(api.recognizeStandardDoc)).toHaveBeenCalledWith(10));
});

test("无批次上下文：面包屑显示『规则库』并导航到 rule-library", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RuleDetailPage docId={7} docTitle="政策B" />
    </QueryClientProvider>,
  );
  const lib = await screen.findByText("规则库");
  await userEvent.click(lib);
  expect(useRouteStore.getState().nav.name).toBe("rule-library");
});
