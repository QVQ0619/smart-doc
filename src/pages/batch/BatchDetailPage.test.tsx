import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BatchDetailPage from "./BatchDetailPage";
import * as batchApi from "../../api/batches";
import * as configApi from "../../api/configPackages";
import { useRouteStore } from "../../store/useRouteStore";

// MaterialLibrary 含复杂子查询，测试中 mock 掉
vi.mock("../../components/MaterialLibrary", () => ({
  default: ({ batchId }: { batchId?: number }) => (
    <div data-testid="material-library-stub">MaterialLibrary batchId={batchId}</div>
  ),
}));

// BindRuleDocsModal mock：只在 open=true 时渲染 stub
vi.mock("../../components/batch/BindRuleDocsModal", () => ({
  default: ({
    open,
  }: {
    open: boolean;
    onClose: () => void;
    batchId: number;
    boundDocIds: number[];
  }) => (open ? <div data-testid="bind-modal-stub">BindModal</div> : null),
}));

const mockDetail = {
  id: 5,
  batch_no: "B-2026-05",
  project_type_name: "科研项目",
  stage_name: "申报",
  status: "reviewing",
  declare_period: "2026.01–2026.03",
  material_count: 2,
  rule_doc_count: 2,
  rule_count: 10,
  rule_docs: [
    {
      id: 11,
      doc_code: "DOC-11",
      title: "规则文件A",
      file_name: "rule_a.pdf",
      size_bytes: 1024,
      mime_type: "application/pdf",
      created_at: "2026-01-10T00:00:00Z",
      recognition_status: "done",
      segment_count: 5,
    },
    {
      id: 12,
      doc_code: "DOC-12",
      title: "规则文件B",
      file_name: "rule_b.pdf",
      size_bytes: 2048,
      mime_type: "application/pdf",
      created_at: "2026-01-11T00:00:00Z",
      recognition_status: "done",
      segment_count: 8,
    },
  ],
};

const mockConfigPackages = [
  {
    doc_id: 11,
    doc_code: "DOC-11",
    title: "配置包A",
    version: "V1.0",
    rule_count: 5,
    dimensions: ["completeness"],
  },
  {
    doc_id: 99,
    doc_code: "DOC-99",
    title: "配置包B(未绑定)",
    version: "V1.0",
    rule_count: 3,
    dimensions: ["compliance"],
  },
];

function renderWithQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("BatchDetailPage", () => {
  beforeEach(() => {
    useRouteStore.setState({ nav: { name: "home" } });
    vi.spyOn(batchApi, "getBatchDetail").mockResolvedValue(mockDetail);
    vi.spyOn(configApi, "listConfigPackages").mockResolvedValue(
      mockConfigPackages,
    );
  });

  it("渲染元信息：批次号、项目类型、审查阶段", async () => {
    renderWithQuery(<BatchDetailPage batchId={5} batchTitle="B-2026-05" />);
    await waitFor(() =>
      expect(screen.getByText("科研项目")).toBeInTheDocument(),
    );
    expect(screen.getByText("申报")).toBeInTheDocument();
    // batch_no 出现在面包屑和描述中
    expect(screen.getAllByText("B-2026-05").length).toBeGreaterThan(0);
  });

  it("规则库 Tab 默认展示 RuleDocCard 标题", async () => {
    renderWithQuery(<BatchDetailPage batchId={5} batchTitle="B-2026-05" />);
    await waitFor(() =>
      expect(screen.getByText("规则文件A")).toBeInTheDocument(),
    );
    expect(screen.getByText("规则文件B")).toBeInTheDocument();
  });

  it("点击'查看规则' → navigate rule-detail 携带 docId/batchId", async () => {
    renderWithQuery(<BatchDetailPage batchId={5} batchTitle="B-2026-05" />);
    await waitFor(() =>
      expect(screen.getAllByText("查看规则").length).toBeGreaterThan(0),
    );
    // 第一个"查看规则"对应 doc id=11
    await userEvent.click(screen.getAllByText("查看规则")[0]);
    const nav = useRouteStore.getState().nav;
    expect(nav).toMatchObject({ name: "rule-detail", docId: 11, batchId: 5 });
  });

  it("点击'绑定规则集' → BindRuleDocsModal 出现", async () => {
    renderWithQuery(<BatchDetailPage batchId={5} batchTitle="B-2026-05" />);
    await waitFor(() =>
      expect(screen.getByText("绑定规则集")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText("绑定规则集"));
    expect(await screen.findByTestId("bind-modal-stub")).toBeInTheDocument();
  });

  it("切到'审查文档库' Tab → MaterialLibrary stub 出现", async () => {
    renderWithQuery(<BatchDetailPage batchId={5} batchTitle="B-2026-05" />);
    // 等待 detail 加载完毕，Tab 渲染出来
    await waitFor(() =>
      expect(screen.getByText(/审查文档库/)).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText(/审查文档库/));
    expect(await screen.findByTestId("material-library-stub")).toBeInTheDocument();
  });

  it("面包屑'项目批次'可点击 → navigate batch-list", async () => {
    renderWithQuery(<BatchDetailPage batchId={5} batchTitle="B-2026-05" />);
    await waitFor(() =>
      expect(screen.getByText("项目批次")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText("项目批次"));
    expect(useRouteStore.getState().nav).toMatchObject({ name: "batch-list" });
  });

  it("规则库 Tab 卡片显示 clause_count 和 rule_count 计数", async () => {
    const detailWithCounts = {
      ...mockDetail,
      rule_docs: [
        {
          ...mockDetail.rule_docs[0],
          clause_count: 17,
          rule_count: 23,
        },
        mockDetail.rule_docs[1],
      ],
    };
    vi.spyOn(batchApi, "getBatchDetail").mockResolvedValue(detailWithCounts);
    renderWithQuery(<BatchDetailPage batchId={5} batchTitle="B-2026-05" />);
    await waitFor(() =>
      expect(screen.getByText("规则文件A")).toBeInTheDocument(),
    );
    // RuleDocCard 渲染 <b>17</b>条款 和 <b>23</b>规则
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
  });
});
