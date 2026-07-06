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

function filenameFromDisposition(cd: string, fallback: string): string {
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) {
    try { return decodeURIComponent(star[1]); } catch { /* ignore */ }
  }
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain ? plain[1] : fallback;
}

async function downloadReportFormat(packageId: number, format: "docx" | "pdf"): Promise<void> {
  const res = await fetch(`/api/packages/${packageId}/report/export?format=${format}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const filename = filenameFromDisposition(cd, `立项审查报告_包${packageId}.${format}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// 导出审查报告:分别下载 Word 和 PDF 两个文件(不再打包成 zip)。
export async function exportPackageReport(packageId: number): Promise<void> {
  await downloadReportFormat(packageId, "docx");
  await downloadReportFormat(packageId, "pdf");
}
