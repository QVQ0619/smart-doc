import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BindRuleDocsModal from "./BindRuleDocsModal";
import * as stdApi from "../../api/standardDocs";
import * as batchApi from "../../api/batches";

const docs = [
  {
    id: 1,
    doc_code: "D1",
    title: "规则文件1",
    file_name: "d1.pdf",
    size_bytes: null,
    mime_type: null,
    created_at: null,
    recognition_status: "done",
  },
  {
    id: 2,
    doc_code: "D2",
    title: "规则文件2",
    file_name: "d2.pdf",
    size_bytes: null,
    mime_type: null,
    created_at: null,
    recognition_status: "done",
  },
  {
    id: 3,
    doc_code: "D3",
    title: "规则文件3",
    file_name: "d3.pdf",
    size_bytes: null,
    mime_type: null,
    created_at: null,
    recognition_status: "done",
  },
];

function renderWithQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("BindRuleDocsModal", () => {
  beforeEach(() => {
    vi.spyOn(stdApi, "listStandardDocs").mockResolvedValue(docs);
  });

  it("渲染3个规则文件 checkbox 选项", async () => {
    renderWithQuery(
      <BindRuleDocsModal
        open={true}
        onClose={vi.fn()}
        batchId={5}
        boundDocIds={[1]}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("规则文件1")).toBeInTheDocument(),
    );
    expect(screen.getByText("规则文件2")).toBeInTheDocument();
    expect(screen.getByText("规则文件3")).toBeInTheDocument();
  });

  it("预勾选 boundDocIds=[1]，doc1 对应 checkbox 为选中态", async () => {
    renderWithQuery(
      <BindRuleDocsModal
        open={true}
        onClose={vi.fn()}
        batchId={5}
        boundDocIds={[1]}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("规则文件1")).toBeInTheDocument(),
    );
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    const checkedCount = checkboxes.filter((c) => c.checked).length;
    expect(checkedCount).toBe(1);
  });

  it("勾选 doc2 后保存 → bindRuleDocs 含 [1,2]", async () => {
    const bindSpy = vi
      .spyOn(batchApi, "bindRuleDocs")
      .mockResolvedValue({ bound_count: 2 });
    const onClose = vi.fn();
    renderWithQuery(
      <BindRuleDocsModal
        open={true}
        onClose={onClose}
        batchId={5}
        boundDocIds={[1]}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("规则文件2")).toBeInTheDocument(),
    );
    // 点击 doc2 的 checkbox label 文本触发勾选
    await userEvent.click(screen.getByText("规则文件2"));
    // 点击保存（antd 2字按钮会加空格，用 regex）
    await userEvent.click(screen.getByRole("button", { name: /保/ }));
    await waitFor(() => expect(bindSpy).toHaveBeenCalled());
    const [calledBatchId, calledIds] = bindSpy.mock.calls[0];
    expect(calledBatchId).toBe(5);
    expect(calledIds).toContain(1);
    expect(calledIds).toContain(2);
  });

  it("保存成功 → onClose 被调用", async () => {
    vi.spyOn(batchApi, "bindRuleDocs").mockResolvedValue({ bound_count: 1 });
    const onClose = vi.fn();
    renderWithQuery(
      <BindRuleDocsModal
        open={true}
        onClose={onClose}
        batchId={5}
        boundDocIds={[1]}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("规则文件1")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole("button", { name: /保/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
