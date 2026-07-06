import { describe, it, expect, vi, afterEach } from "vitest";
import {
  renderReviewPrompt,
  getReviewPromptTemplate,
  DEFAULT_REVIEW_PROMPT_TEMPLATE,
} from "./settings";

afterEach(() => vi.restoreAllMocks());

describe("renderReviewPrompt", () => {
  it("替换全部三个变量(含重复出现)", () => {
    const tpl = "对{任务名称}的「{审查项}」审查{报告文件名};再提一次{审查项}";
    expect(
      renderReviewPrompt(tpl, { reviewLabel: "经济性审查", fileName: "a.docx", taskName: "任务甲" }),
    ).toBe("对任务甲的「经济性审查」审查a.docx;再提一次经济性审查");
  });

  it("默认模板渲染后不残留占位符", () => {
    const out = renderReviewPrompt(DEFAULT_REVIEW_PROMPT_TEMPLATE, {
      reviewLabel: "综合论证报告审查",
      fileName: "综合论证.docx",
      taskName: "任务乙",
    });
    expect(out).not.toMatch(/\{.+?\}/);
    expect(out).toContain("综合论证报告审查");
  });
});

describe("getReviewPromptTemplate", () => {
  it("已配置时返回配置值", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ key: "review_prompt_template", value: "自定义模板{审查项}" }),
    }));
    expect(await getReviewPromptTemplate()).toBe("自定义模板{审查项}");
  });

  it("未配置(value=null)回退默认模板", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ key: "review_prompt_template", value: null }),
    }));
    expect(await getReviewPromptTemplate()).toBe(DEFAULT_REVIEW_PROMPT_TEMPLATE);
  });

  it("请求失败回退默认模板,不抛错", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await getReviewPromptTemplate()).toBe(DEFAULT_REVIEW_PROMPT_TEMPLATE);
  });
});
