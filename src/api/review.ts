export interface ReviewEvidence {
  segment_id: number | null;
  field_code: string | null;
  budget_item_id: number | null;
  note: string | null;
}
export interface ReviewCheck {
  round_check_id: number;
  rule_version_id: number;
  rule_code: string;
  name: string;
  dimension_code: string;
  initial_result: string;
  initial_disposition: string | null;
  final_result: string | null;
  final_disposition: string | null;
  effective_result: string;
  status: string;
  suggestion: string | null;
  confidence: number | null;
  severity: number | null;
  version: number;
  evidence: ReviewEvidence[];
}
export interface ReviewRoundInfo {
  round_id: number;
  round_no: number;
  conclusion: string;
}
export interface PackageReview {
  round: ReviewRoundInfo | null;
  checks: ReviewCheck[];
}
export interface ReviewActionBody {
  action: "confirm" | "overrule";
  final_result?: string;
  final_disposition?: string | null;
  remark?: string;
  version: number;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

function authHeaders(): Record<string, string> {
  const k = import.meta.env.VITE_SMART_DOC_API_KEY?.trim();
  return k ? { "X-API-Key": k } : {};
}

export function getPackageReview(packageId: number): Promise<PackageReview> {
  return fetch(`/api/packages/${packageId}/review`).then((r) => handle<PackageReview>(r));
}

export function postReviewAction(roundCheckId: number, body: ReviewActionBody): Promise<ReviewCheck> {
  return fetch(`/api/round-checks/${roundCheckId}/review-action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  }).then((r) => handle<ReviewCheck>(r));
}
