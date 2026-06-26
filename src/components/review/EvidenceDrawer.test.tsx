import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EvidenceDrawer, { resolveEvidence } from "./EvidenceDrawer";
import type { ReviewCheck } from "../../api/review";

const SEGMENTS = [{ material_file_id: 1, file_name: "a.pdf",
  segments: [{ id: 5, page_no: 1, locator: null, segment_type: "text", content_text: "负责人 2022 年中断 1 年" }] }];
const STRUCTURED = { package_id: 7, members: [], coop_units: [], attachments: [],
  budget_items: [{ id: 2, category: "device", item_name: "设备费", amount: 240000, source_segment_id: null }],
  fields: [{ id: 1, field_code: "title", field_value: "某项目", extraction_status: "ok", source_segment_id: null }] };

function chk(over: Partial<ReviewCheck>): ReviewCheck {
  return { round_check_id: 1, rule_version_id: 1, rule_code: "R", name: "规则", dimension_code: "compliance",
    initial_result: "fail", initial_disposition: null, final_result: null, final_disposition: null,
    effective_result: "fail", status: "open", suggestion: null, confidence: null, severity: null,
    version: 0, evidence: [], ...over };
}

describe("resolveEvidence", () => {
  it("段落出处取段落原文", () => {
    const r = resolveEvidence(chk({ evidence: [{ segment_id: 5, field_code: null, budget_item_id: null, note: null }] }),
      SEGMENTS as never, STRUCTURED as never);
    expect(r[0].text).toBe("负责人 2022 年中断 1 年");
  });
  it("字段/预算出处取结构化值，多条并列", () => {
    const r = resolveEvidence(chk({ evidence: [
      { segment_id: null, field_code: "title", budget_item_id: null, note: null },
      { segment_id: null, field_code: null, budget_item_id: 2, note: null },
    ] }), SEGMENTS as never, STRUCTURED as never);
    expect(r).toHaveLength(2);
    expect(r[0].text).toContain("某项目");
    expect(r[1].text).toContain("设备费");
  });
});

describe("EvidenceDrawer", () => {
  it("打开时显示原文", () => {
    render(<EvidenceDrawer check={chk({ evidence: [{ segment_id: 5, field_code: null, budget_item_id: null, note: null }] })}
      segments={SEGMENTS as never} structured={STRUCTURED as never} onClose={() => {}} />);
    expect(screen.getByText(/负责人 2022 年中断 1 年/)).toBeInTheDocument();
  });
});
