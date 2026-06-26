import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import VerdictBanner from "./VerdictBanner";

describe("VerdictBanner", () => {
  it("显示结论文案与四项计数", () => {
    render(<VerdictBanner conclusion="reject"
      counts={{ pass: 15, fail: 3, need_review: 2, not_applicable: 0 }} reviewed={5} total={20} />);
    expect(screen.getByText("建议不予立项")).toBeInTheDocument();
    expect(screen.getByText("15 通过")).toBeInTheDocument();
    expect(screen.getByText("3 不通过")).toBeInTheDocument();
    expect(screen.getByText("2 待复核")).toBeInTheDocument();
    expect(screen.getByText("复核进度 5/20")).toBeInTheDocument();
  });

  it("未知结论回退显示原值", () => {
    render(<VerdictBanner conclusion="weird"
      counts={{ pass: 0, fail: 0, need_review: 0, not_applicable: 0 }} reviewed={0} total={0} />);
    expect(screen.getByText("weird")).toBeInTheDocument();
  });
});
