import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CreateBatchModal from "./CreateBatchModal";
import * as api from "../../api/batches";

function renderWithQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockBatchOut = {
  id: 1,
  batch_no: "B-2026-01",
  project_type_name: "科研项目",
  stage_name: "申报",
  status: "reviewing",
  declare_period: null,
  material_count: 0,
  rule_doc_count: 0,
  rule_count: 0,
};

describe("CreateBatchModal", () => {
  it("填写批次号提交 → 调用 createBatch 含 batch_no", async () => {
    const mockCreate = vi
      .spyOn(api, "createBatch")
      .mockResolvedValue(mockBatchOut);
    const onClose = vi.fn();
    renderWithQuery(<CreateBatchModal open={true} onClose={onClose} />);

    await waitFor(() =>
      expect(screen.getByLabelText(/批次号/)).toBeInTheDocument(),
    );
    await userEvent.type(screen.getByLabelText(/批次号/), "B-2026-01");
    // antd 对2字中文按钮文本加空格："创 建"
    await userEvent.click(screen.getByRole("button", { name: /创/ }));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ batch_no: "B-2026-01" }),
      ),
    );
  });

  it("批次号为空提交 → 校验报错且不调用 createBatch", async () => {
    const mockCreate = vi
      .spyOn(api, "createBatch")
      .mockResolvedValue(mockBatchOut);
    renderWithQuery(<CreateBatchModal open={true} onClose={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /创/ })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole("button", { name: /创/ }));

    await waitFor(() =>
      expect(screen.getByText("批次号必填")).toBeInTheDocument(),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
