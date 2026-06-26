import { render, screen, fireEvent } from "@testing-library/react";
import RuleDocCard from "./RuleDocCard";

test("done状态 渲染标题/已识别/段条款规则计数", () => {
  render(
    <RuleDocCard
      title="国家重点研发计划申报指南"
      recognitionStatus="done"
      segmentCount={15}
      clauseCount={8}
      ruleCount={10}
    />,
  );
  // 标题
  expect(screen.getByText("国家重点研发计划申报指南")).toBeInTheDocument();
  // 状态 Tag（span 精确 textContent = "已识别"）
  expect(screen.getByText("已识别")).toBeInTheDocument();
  // 各计数（<b> 精确文本）
  expect(screen.getByText("15")).toBeInTheDocument();
  expect(screen.getByText("8")).toBeInTheDocument();
  expect(screen.getByText("10")).toBeInTheDocument();
});

test("actions插槽 渲染传入操作内容", () => {
  render(
    <RuleDocCard
      title="测试文件"
      recognitionStatus="done"
      actions={<button>查看规则</button>}
    />,
  );
  expect(screen.getByRole("button", { name: "查看规则" })).toBeInTheDocument();
});

test("onClick 点击卡片触发回调", () => {
  const handleClick = vi.fn();
  const { container } = render(
    <RuleDocCard
      title="测试文件"
      recognitionStatus="done"
      onClick={handleClick}
    />,
  );
  fireEvent.click(container.firstChild as HTMLElement);
  expect(handleClick).toHaveBeenCalledTimes(1);
});

test("processing状态+无计数 显示识别中 统计显示破折号", () => {
  render(<RuleDocCard title="识别中文件" recognitionStatus="processing" />);
  // 状态 Tag
  expect(screen.getByText("识别中")).toBeInTheDocument();
  // 统计行应显示"—"而非具体数字
  const dashes = screen.getAllByText("—");
  expect(dashes.length).toBeGreaterThanOrEqual(1);
  // 不应有具体计数数字（未传 segmentCount/clauseCount/ruleCount）
  expect(screen.queryByText("0")).not.toBeInTheDocument();
});
