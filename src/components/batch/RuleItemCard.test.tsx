import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RuleItemCard from "./RuleItemCard";
import type { Rule } from "../../api/standardDocs";

const baseRule: Rule = {
  id: 1,
  rule_code: "RULE-001",
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
  clause_text: "申请书...",
  page_no: 3,
  locator: { block_index: 1 },
};

test("渲染规则名", () => {
  render(<RuleItemCard rule={baseRule} onEdit={vi.fn()} onDelete={vi.fn()} />);
  expect(screen.getByText("申请书须包含完整的预算编制说明")).toBeInTheDocument();
});

test("渲染判定标签「硬性」", () => {
  render(<RuleItemCard rule={baseRule} onEdit={vi.fn()} onDelete={vi.fn()} />);
  expect(screen.getByText("硬性")).toBeInTheDocument();
});

test("渲染处置标签「驳回」", () => {
  render(<RuleItemCard rule={baseRule} onEdit={vi.fn()} onDelete={vi.fn()} />);
  expect(screen.getByText("驳回")).toBeInTheDocument();
});

test("渲染判定逻辑文本", () => {
  render(<RuleItemCard rule={baseRule} onEdit={vi.fn()} onDelete={vi.fn()} />);
  expect(screen.getByText(/若申请书缺少预算说明章节/)).toBeInTheDocument();
});

test("无 logic 时不渲染判定逻辑区域", () => {
  render(<RuleItemCard rule={{ ...baseRule, logic: null }} onEdit={vi.fn()} onDelete={vi.fn()} />);
  expect(screen.queryByText("判定逻辑：")).not.toBeInTheDocument();
});

test("渲染出处（页+段）", () => {
  render(<RuleItemCard rule={baseRule} onEdit={vi.fn()} onDelete={vi.fn()} />);
  // page_no=3, block_index=1 → 第3页第2段
  expect(screen.getByText(/第3页第2段/)).toBeInTheDocument();
});

test("浏览态不显示 binding 字段", () => {
  render(<RuleItemCard rule={baseRule} onEdit={vi.fn()} onDelete={vi.fn()} />);
  // binding_class="common" 对应「通用」，不应展示
  expect(screen.queryByText("通用")).not.toBeInTheDocument();
  expect(screen.queryByText("参数化")).not.toBeInTheDocument();
  expect(screen.queryByText("特定")).not.toBeInTheDocument();
});

test("点击「编辑」触发 onEdit 回调", async () => {
  const onEdit = vi.fn();
  render(<RuleItemCard rule={baseRule} onEdit={onEdit} onDelete={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "编辑" }));
  expect(onEdit).toHaveBeenCalledOnce();
});

test("点击「删除」再确认触发 onDelete 回调", async () => {
  const onDelete = vi.fn();
  render(<RuleItemCard rule={baseRule} onEdit={vi.fn()} onDelete={onDelete} />);
  await userEvent.click(screen.getByRole("button", { name: "删除" }));
  await userEvent.click(await screen.findByRole("button", { name: /确.?定/ }));
  expect(onDelete).toHaveBeenCalledOnce();
});

test("hard 判定 Tag 渲染红色（color prop）", () => {
  render(<RuleItemCard rule={baseRule} onEdit={vi.fn()} onDelete={vi.fn()} />);
  const tag = screen.getByText("硬性");
  expect(tag).toBeInTheDocument();
  // antd Tag 对非预设颜色使用 inline style（background-color 用 rgb 格式）
  const tagEl = tag.closest(".ant-tag") as HTMLElement | null;
  if (tagEl) {
    const style = tagEl.getAttribute("style") ?? "";
    // #ff4d4f → rgb(255, 77, 79)
    expect(style).toContain("rgb(255, 77, 79)");
  }
});

test("verify 判定 Tag 渲染橙色", () => {
  render(<RuleItemCard rule={{ ...baseRule, decision_type: "verify" }} onEdit={vi.fn()} onDelete={vi.fn()} />);
  const tag = screen.getByText("需核验");
  expect(tag).toBeInTheDocument();
  const tagEl = tag.closest(".ant-tag") as HTMLElement | null;
  if (tagEl) {
    const style = tagEl.getAttribute("style") ?? "";
    // #fa8c16 → rgb(250, 140, 22)
    expect(style).toContain("rgb(250, 140, 22)");
  }
});

test("soft 判定 Tag 渲染蓝色", () => {
  render(<RuleItemCard rule={{ ...baseRule, decision_type: "soft" }} onEdit={vi.fn()} onDelete={vi.fn()} />);
  const tag = screen.getByText("建议");
  expect(tag).toBeInTheDocument();
  const tagEl = tag.closest(".ant-tag") as HTMLElement | null;
  if (tagEl) {
    const style = tagEl.getAttribute("style") ?? "";
    // #1677ff → rgb(22, 119, 255)
    expect(style).toContain("rgb(22, 119, 255)");
  }
});
