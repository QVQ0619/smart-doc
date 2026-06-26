import { render, screen, fireEvent } from "@testing-library/react";
import BatchCard from "./BatchCard";

const baseProps = {
  title: "2026 年度国家重点研发计划",
  batchNo: "BATCH-2026-001",
  status: "reviewing",
  projectTypeName: "重点专项",
  stageName: "形式审查",
  materialCount: 12,
  ruleDocCount: 3,
  ruleCount: 28,
  declarePeriod: "2026.03–2026.05",
};

test("渲染标题/批次号/审查中/项目类型/阶段/统计数字", () => {
  render(<BatchCard {...baseProps} />);
  // 标题（<span class="batch-card__title-text"> 精确文本）
  expect(screen.getByText("2026 年度国家重点研发计划")).toBeInTheDocument();
  // 批次号包含在副信息 div 中
  expect(document.body).toHaveTextContent("BATCH-2026-001");
  // 状态 Tag 精确文本
  expect(screen.getByText("审查中")).toBeInTheDocument();
  // 项目类型/阶段 Tag
  expect(screen.getByText("重点专项")).toBeInTheDocument();
  expect(screen.getByText("形式审查")).toBeInTheDocument();
  // 统计数字（<b> 精确文本）
  expect(screen.getByText("12")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
  expect(screen.getByText("28")).toBeInTheDocument();
});

test("actions插槽 渲染传入操作内容", () => {
  render(
    <BatchCard {...baseProps} actions={<button>进入批次</button>} />,
  );
  expect(screen.getByRole("button", { name: "进入批次" })).toBeInTheDocument();
});

test("onClick 点击卡片触发回调", () => {
  const handleClick = vi.fn();
  const { container } = render(
    <BatchCard {...baseProps} onClick={handleClick} />,
  );
  fireEvent.click(container.firstChild as HTMLElement);
  expect(handleClick).toHaveBeenCalledTimes(1);
});
