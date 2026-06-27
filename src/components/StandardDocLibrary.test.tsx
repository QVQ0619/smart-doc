import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StandardDocLibrary from "./StandardDocLibrary";
import * as api from "../api/standardDocs";
import { toast } from "sonner";
import { useRouteStore } from "../store/useRouteStore";

// --- Blade SDK mock ---
// vi.hoisted 确保变量在 vi.mock 工厂函数执行前已初始化
const mockSend = vi.hoisted(() => vi.fn());
const _bladeState = vi.hoisted(() => ({
  activeSessionId: "session-123" as string | null,
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

vi.mock("../api/standardDocs", async () => {
  const actual = await vi.importActual<typeof api>("../api/standardDocs");
  return {
    ...actual,
    listStandardDocs: vi.fn(),
    deleteStandardDoc: vi.fn(),
    recognizeStandardDoc: vi.fn(),
    listClauses: vi.fn(),
    listRules: vi.fn(),
    updateClause: vi.fn(),
    deleteClause: vi.fn(),
    updateRule: vi.fn(),
    deleteRule: vi.fn(),
  };
});

function renderLib() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StandardDocLibrary />
    </QueryClientProvider>,
  );
}

const sample = {
  id: 1, doc_code: "SD-abc", title: "政策A",
  file_name: "政策A.pdf", size_bytes: 2048, mime_type: "application/pdf", created_at: "2026-06-18T00:00:00Z",
  recognition_status: "done",
};

beforeEach(() => {
  vi.clearAllMocks();
  // 重置 blade 状态
  _bladeState.activeSessionId = "session-123";
  // 重置路由 store
  useRouteStore.setState({ nav: { name: "home" } });

  vi.mocked(api.listStandardDocs).mockResolvedValue([sample] as never);
  vi.mocked(api.deleteStandardDoc).mockResolvedValue();
  vi.mocked(api.recognizeStandardDoc).mockResolvedValue({
    doc_id: 1, doc_code: "SD-abc", recognition_status: "processing", segment_count: 9, page_count: 2, error: null,
  } as never);
  vi.mocked(api.listClauses).mockResolvedValue([
    { id: 1, clause_no: "第一条", clause_text: "申请人应当具有高级职称。", source_segment_id: 5, page_no: 2, locator: { page: 2, block_index: 1 } },
  ] as never);
  vi.mocked(api.listRules).mockResolvedValue([] as never);
  vi.mocked(api.updateClause).mockResolvedValue({} as never);
  vi.mocked(api.deleteClause).mockResolvedValue();
  vi.mocked(api.updateRule).mockResolvedValue({} as never);
  vi.mocked(api.deleteRule).mockResolvedValue();
});

test("渲染列表中的规则文件标题", async () => {
  renderLib();
  expect(await screen.findByText("政策A")).toBeInTheDocument();
});

test("规则库页不再提供上传按钮（上传走聊天）", async () => {
  renderLib();
  await screen.findByText("政策A");
  expect(screen.queryByRole("button", { name: "上传规则文件" })).not.toBeInTheDocument();
});

test("彻底删除经确认调用 deleteStandardDoc", async () => {
  renderLib();
  await screen.findByText("政策A");
  await userEvent.click(screen.getByRole("button", { name: "彻底删除" }));
  await userEvent.click(await screen.findByRole("button", { name: "确认彻底删除" }));
  await waitFor(() => expect(vi.mocked(api.deleteStandardDoc)).toHaveBeenCalledWith(1));
});

test("显示识别状态徽标", async () => {
  renderLib();
  expect(await screen.findByText("已识别")).toBeInTheDocument();
});

test("点重新识别调用 recognizeStandardDoc", async () => {
  renderLib();
  await screen.findByText("政策A");
  await userEvent.click(screen.getByRole("button", { name: "重新识别" }));
  await waitFor(() => expect(vi.mocked(api.recognizeStandardDoc)).toHaveBeenCalledWith(1));
});

test("有会话时点重新识别识别完成后自动发 send 命令", async () => {
  // 模拟真实时序：先 processing，再 done；用受控 Promise 精确验证 processing→done 后才发 send
  const processingDoc = { ...sample, recognition_status: "processing" as const };
  const doneDoc = { ...sample, recognition_status: "done" as const };

  // doneDeferred 控制第二次 listStandardDocs（invalidation 触发的 refetch）的返回时机
  let resolveDone!: (v: any) => void;
  const doneDeferred = new Promise<any>((res) => { resolveDone = res; });

  vi.mocked(api.listStandardDocs)
    .mockResolvedValueOnce([processingDoc] as never)    // 初始渲染：processing
    .mockReturnValueOnce(doneDeferred as never)         // invalidation 后 refetch：手动放行
    .mockResolvedValue([doneDoc] as never);             // 后续轮询

  renderLib();

  // 确认文档处于 processing 状态
  await screen.findByText("识别中");

  // 点击重新识别
  await userEvent.click(screen.getByRole("button", { name: "重新识别" }));

  // recognizeStandardDoc 已被调，且 send 尚未被调（refetch 仍挂起，未见 done）
  await waitFor(() => expect(vi.mocked(api.recognizeStandardDoc)).toHaveBeenCalledWith(1));
  expect(mockSend).not.toHaveBeenCalled();

  // 放行：模拟 processing→done 转换
  resolveDone([doneDoc]);

  // done 后 send 应被调，且含正确参数
  await waitFor(() => expect(mockSend).toHaveBeenCalled());
  const msg = mockSend.mock.calls[0][0] as string;
  expect(msg).toContain("doc_id=1");
  expect(msg).toContain("政策A");
});

test("无会话时点重新识别只显示提示不调API", async () => {
  _bladeState.activeSessionId = null;
  const warnSpy = vi.spyOn(toast, "warning");
  renderLib();
  await screen.findByText("政策A");
  await userEvent.click(screen.getByRole("button", { name: "重新识别" }));
  // onRecognize 因无 activeSessionId 早返回，不应调用 recognizeStandardDoc 或 send
  expect(vi.mocked(api.recognizeStandardDoc)).not.toHaveBeenCalled();
  expect(mockSend).not.toHaveBeenCalled();
  await waitFor(() => expect(warnSpy).toHaveBeenCalledWith("请先在右侧开始对话"));
  warnSpy.mockRestore();
});

test("展开文档行显示抽取的条款与出处", async () => {
  const { container } = renderLib();
  await screen.findByText("政策A");
  const expandBtn = container.querySelector(".ant-table-row-expand-icon") as HTMLElement;
  await userEvent.click(expandBtn);
  // 展开后默认显示「审查规则」Tab，切换到「依据条款」Tab
  await userEvent.click(await screen.findByText("依据条款"));
  expect(await screen.findByText("第一条")).toBeInTheDocument();
  expect(await screen.findByText("申请人应当具有高级职称。")).toBeInTheDocument();
  expect(await screen.findByText(/第2页/)).toBeInTheDocument();
});

test("规则库页挂载时每 10 秒轮询刷新列表", async () => {
  vi.useFakeTimers();
  try {
    vi.clearAllMocks();
    renderLib();
    // 刷新初始 microtask, 让首次 fetch 落地
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(api.listStandardDocs)).toHaveBeenCalledTimes(1);
    // 前进 10s 触发轮询
    await vi.advanceTimersByTimeAsync(10000);
    expect(vi.mocked(api.listStandardDocs)).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

test("条款行点编辑→改条文→保存调 updateClause", async () => {
  const { container } = renderLib();
  await screen.findByText("政策A");
  await userEvent.click(container.querySelector(".ant-table-row-expand-icon") as HTMLElement);
  await userEvent.click(await screen.findByText("依据条款"));
  const row = container.querySelector(".ant-table-expanded-row") as HTMLElement;
  await userEvent.click(within(row).getByText("编辑"));
  await screen.findByText("编辑条款");                         // Modal 标题
  await userEvent.click(screen.getByRole("button", { name: /保.?存/ }));
  await waitFor(() => expect(vi.mocked(api.updateClause)).toHaveBeenCalledWith(
    1, 1, { clause_no: "第一条", clause_text: "申请人应当具有高级职称。" },
  ));
});

test("条款行点删除→确认调 deleteClause", async () => {
  const { container } = renderLib();
  await screen.findByText("政策A");
  await userEvent.click(container.querySelector(".ant-table-row-expand-icon") as HTMLElement);
  await userEvent.click(await screen.findByText("依据条款"));
  const row = container.querySelector(".ant-table-expanded-row") as HTMLElement;
  await userEvent.click(within(row).getByText("删除"));
  await userEvent.click(await screen.findByRole("button", { name: /确.?定/ }));
  await waitFor(() => expect(vi.mocked(api.deleteClause)).toHaveBeenCalledWith(1, 1));
});

test("规则行点编辑→保存(沿用预填值)调 updateRule", async () => {
  vi.mocked(api.listClauses).mockResolvedValue([] as never);
  vi.mocked(api.listRules).mockResolvedValue([
    {
      id: 5, rule_code: "RULE-x", version: "V1.0", name: "规则A", logic: null,
      dimension_code: "compliance", dimension_name: "合规性",
      decision_type: "hard", disposition: "reject", binding_class: "common",
      source_clause_id: 9, clause_no: "一", clause_text: "x", page_no: 1, locator: null,
    },
  ] as never);
  const { container } = renderLib();
  await screen.findByText("政策A");
  await userEvent.click(container.querySelector(".ant-table-row-expand-icon") as HTMLElement);
  const row = container.querySelector(".ant-table-expanded-row") as HTMLElement;
  await within(row).findByText("规则A");
  await userEvent.click(within(row).getByText("编辑"));
  await screen.findByText("编辑规则");
  await userEvent.click(screen.getByRole("button", { name: /保.?存/ }));
  await waitFor(() => expect(vi.mocked(api.updateRule)).toHaveBeenCalledWith(1, 5, {
    name: "规则A", logic: null, dimension_code: "compliance",
    decision_type: "hard", disposition: "reject", binding_class: "common",
  }));
});

test("规则行点删除→确认调 deleteRule", async () => {
  vi.mocked(api.listClauses).mockResolvedValue([] as never);
  vi.mocked(api.listRules).mockResolvedValue([
    {
      id: 5, rule_code: "RULE-x", version: "V1.0", name: "规则A", logic: null,
      dimension_code: "compliance", dimension_name: "合规性",
      decision_type: "hard", disposition: "reject", binding_class: "common",
      source_clause_id: 9, clause_no: "一", clause_text: "x", page_no: 1, locator: null,
    },
  ] as never);
  const { container } = renderLib();
  await screen.findByText("政策A");
  await userEvent.click(container.querySelector(".ant-table-row-expand-icon") as HTMLElement);
  const row = container.querySelector(".ant-table-expanded-row") as HTMLElement;
  await within(row).findByText("规则A");
  await userEvent.click(within(row).getByText("删除"));
  await userEvent.click(await screen.findByRole("button", { name: /确.?定/ }));
  await waitFor(() => expect(vi.mocked(api.deleteRule)).toHaveBeenCalledWith(1, 5));
});

test("展开行规则 Tab 展示 review_rule 结构化字段与出处", async () => {
  vi.mocked(api.listStandardDocs).mockResolvedValue([
    {
      id: 3, doc_code: "SD-x", title: "申请规定", file_name: "a.pdf",
      size_bytes: 1, mime_type: "application/pdf", created_at: null,
      recognition_status: "done",
    },
  ] as never);
  vi.mocked(api.listClauses).mockResolvedValue([] as never);
  vi.mocked(api.listRules).mockResolvedValue([
    {
      id: 1, rule_code: "RULE-abc", version: "V1.0", name: "同年限申请1项", logic: null,
      dimension_code: "compliance", dimension_name: "合规性",
      decision_type: "hard", disposition: "reject", binding_class: "common",
      source_clause_id: 9, clause_no: "二(一)1", clause_text: "同年只能申请1项",
      page_no: 5, locator: { page: 5, block_index: 0 },
    },
  ] as never);
  const { container } = renderLib();
  await screen.findByText("申请规定");
  // 展开该文档行
  const expandBtn = container.querySelector(".ant-table-row-expand-icon") as HTMLElement;
  await userEvent.click(expandBtn);
  await waitFor(() => expect(vi.mocked(api.listRules)).toHaveBeenCalledWith(3));
  expect(await screen.findByText("同年限申请1项")).toBeInTheDocument();
  expect(screen.getByText("合规性")).toBeInTheDocument();
  expect(screen.getByText("第5页第1段")).toBeInTheDocument();
});

test("processing 状态显示识别中徽标", async () => {
  vi.mocked(api.listStandardDocs).mockResolvedValue([
    { ...sample, recognition_status: "processing" },
  ] as never);
  renderLib();
  expect(await screen.findByText("识别中")).toBeInTheDocument();
});

test("有 processing 行时轮询间隔收紧到 3 秒", async () => {
  vi.useFakeTimers();
  try {
    vi.clearAllMocks();
    vi.mocked(api.listStandardDocs).mockResolvedValue([
      { ...sample, recognition_status: "processing" },
    ] as never);
    renderLib();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(api.listStandardDocs)).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);            // 3s 即触发下一次
    expect(vi.mocked(api.listStandardDocs)).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

test("文档初始为 failed 时重新识别不触发假失败，processing→done 后正常发 send", async () => {
  const failedDoc     = { ...sample, recognition_status: "failed"     as const };
  const processingDoc = { ...sample, recognition_status: "processing" as const };
  const doneDoc       = { ...sample, recognition_status: "done"       as const };

  // processingDeferred 控制点击后 invalidation refetch 的放行时机
  let resolveProcessing!: (v: any) => void;
  const processingDeferred = new Promise<any>((res) => { resolveProcessing = res; });
  // doneDeferred 控制手动第二次 invalidation 后的放行时机
  let resolveDone!: (v: any) => void;
  const doneDeferred = new Promise<any>((res) => { resolveDone = res; });

  vi.mocked(api.listStandardDocs)
    .mockResolvedValueOnce([failedDoc]      as never)  // ① 初始渲染：failed
    .mockReturnValueOnce(processingDeferred as never)  // ② 点击后 invalidation refetch（挂起）
    .mockReturnValueOnce(doneDeferred       as never)  // ③ 手动第二次 invalidation（挂起）
    .mockResolvedValue([doneDoc]            as never); // ④ 后续

  const errorSpy = vi.spyOn(toast, "error");

  // 暴露 QueryClient 以便测试内手动 invalidate，绕开 3s refetchInterval
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <StandardDocLibrary />
    </QueryClientProvider>,
  );

  // 等初始渲染 → 识别失败
  expect(await screen.findByText("识别失败")).toBeInTheDocument();

  // 点击重新识别（文档当前为 failed）
  await userEvent.click(screen.getByRole("button", { name: "重新识别" }));
  await waitFor(() => expect(vi.mocked(api.recognizeStandardDoc)).toHaveBeenCalledWith(1));

  // 陈旧 failed 被 sawProcessing 守卫忽略：无假错误、无 send
  expect(errorSpy).not.toHaveBeenCalled();
  expect(mockSend).not.toHaveBeenCalled();

  // 放行 processing → effect 置 sawProcessing=true，send 不触发
  resolveProcessing([processingDoc]);
  await waitFor(() => expect(screen.getByText("识别中")).toBeInTheDocument());
  expect(mockSend).not.toHaveBeenCalled();
  expect(errorSpy).not.toHaveBeenCalled();

  // 手动 invalidate 触发第 3 次 refetch → doneDeferred（不 await，避免阻塞于 doneDeferred）
  qc.invalidateQueries({ queryKey: ["standard-docs"] });
  // 等第 3 次 listStandardDocs 调用开始
  await waitFor(() => expect(vi.mocked(api.listStandardDocs)).toHaveBeenCalledTimes(3));
  // 放行 done → effect 发送命令
  resolveDone([doneDoc]);

  await waitFor(() => expect(mockSend).toHaveBeenCalled());
  const msg = mockSend.mock.calls[0][0] as string;
  expect(msg).toContain("doc_id=1");
  expect(msg).toContain("政策A");
  // 全程无假的 error 提示
  expect(errorSpy).not.toHaveBeenCalled();

  errorSpy.mockRestore();
});

test("点击查看原文件→预览弹窗出现(PDF 显示 iframe)", async () => {
  renderLib();
  await screen.findByText("政策A");
  await userEvent.click(screen.getByText("查看原文件"));
  await waitFor(() => {
    const iframe = document.body.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute("src")).toBe("/api/standard-docs/1/download");
  });
});

test("点击『查看规则』→ navigate rule-detail（无 batch）", async () => {
  renderLib();
  const btn = await screen.findAllByText("查看规则");
  await userEvent.click(btn[0]);
  const nav = useRouteStore.getState().nav;
  expect(nav.name).toBe("rule-detail");
  if (nav.name === "rule-detail") {
    expect(nav.batchId).toBeUndefined();
  }
});
