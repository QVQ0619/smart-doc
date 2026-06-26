import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StatCards from "./StatCards";

describe("StatCards", () => {
  it("点不通过卡回调 fail", () => {
    const onToggle = vi.fn();
    render(<StatCards counts={{ pass: 15, fail: 3, need_review: 2, not_applicable: 0 }}
      active={null} onToggle={onToggle} />);
    fireEvent.click(screen.getByText("不通过").closest("div[data-filter]")!);
    expect(onToggle).toHaveBeenCalledWith("fail");
  });

  it("active 卡片带 data-active", () => {
    render(<StatCards counts={{ pass: 1, fail: 1, need_review: 1, not_applicable: 1 }}
      active="pass" onToggle={() => {}} />);
    expect(screen.getByText("通过").closest("div[data-filter]")).toHaveAttribute("data-active", "true");
  });
});
