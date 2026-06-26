export type ResultKey = "pass" | "fail" | "need_review" | "not_applicable";

export const CONCLUSION: Record<string, { label: string; color: string }> = {
  reject: { label: "建议不予立项", color: "error" },
  fix: { label: "需整改", color: "warning" },
  accept: { label: "通过", color: "success" },
  pending: { label: "待定", color: "default" },
};

export const RESULT: Record<string, { label: string; color: string }> = {
  pass: { label: "通过", color: "success" },
  fail: { label: "不通过", color: "error" },
  need_review: { label: "待复核", color: "warning" },
  not_applicable: { label: "不适用", color: "default" },
  pending: { label: "待判", color: "default" },
  error: { label: "错误", color: "error" },
};

export const DIMENSION_LABELS: Record<string, string> = {
  completeness: "完整性",
  normativeness: "规范性",
  compliance: "合规性",
  consistency: "一致性",
  rationality: "合理性",
  authenticity: "真实性",
};

export function dimensionLabel(code: string): string {
  return DIMENSION_LABELS[code] ?? code;
}
