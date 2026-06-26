import type { ReviewCheck } from "../../api/review";
import { dimensionLabel, type ResultKey } from "./review-constants";

export interface Counts { pass: number; fail: number; need_review: number; not_applicable: number; }
export interface DimensionGroupData {
  code: string; label: string; checks: ReviewCheck[]; counts: Counts; hasProblem: boolean;
}

export function resultOf(c: ReviewCheck): string {
  return c.final_result ?? c.effective_result ?? c.initial_result;
}

function emptyCounts(): Counts { return { pass: 0, fail: 0, need_review: 0, not_applicable: 0 }; }

export function countChecks(checks: ReviewCheck[]): Counts {
  const counts = emptyCounts();
  for (const c of checks) {
    const r = resultOf(c) as ResultKey;
    if (r in counts) counts[r] += 1;
  }
  return counts;
}

export function groupByDimension(checks: ReviewCheck[]): DimensionGroupData[] {
  const map = new Map<string, ReviewCheck[]>();
  for (const c of checks) {
    const arr = map.get(c.dimension_code) ?? [];
    arr.push(c);
    map.set(c.dimension_code, arr);
  }
  const groups: DimensionGroupData[] = [];
  for (const [code, arr] of map) {
    const counts = countChecks(arr);
    groups.push({
      code, label: dimensionLabel(code), checks: arr, counts,
      hasProblem: counts.fail > 0 || counts.need_review > 0,
    });
  }
  // Array.sort 稳定：问题组排前，其余维持插入序
  groups.sort((a, b) => Number(b.hasProblem) - Number(a.hasProblem));
  return groups;
}

export function evidenceLabel(c: ReviewCheck): string {
  if (!c.evidence.length) return "—";
  return c.evidence.map((e) =>
    e.segment_id != null ? `段落#${e.segment_id}` :
    e.field_code != null ? `字段:${e.field_code}` :
    e.budget_item_id != null ? `预算#${e.budget_item_id}` : "—").join("、");
}
