export interface StandardDoc {
  id: number;
  doc_code: string;
  title: string;
  file_name: string;
  size_bytes: number | null;
  mime_type: string | null;
  created_at: string | null;
  recognition_status: string;
  segment_count?: number | null;
  page_count?: number | null;
}

export interface RecognizeResult {
  doc_id: number;
  doc_code: string;
  recognition_status: string;
  segment_count: number;
  page_count: number | null;
  error: string | null;
}

export interface UploadFailed {
  name: string;
  reason: string;
}

export interface UploadResult {
  uploaded: StandardDoc[];
  failed: UploadFailed[];
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function listStandardDocs(): Promise<StandardDoc[]> {
  return fetch("/api/standard-docs").then((r) => handle<StandardDoc[]>(r));
}

export function uploadStandardDocs(files: File[]): Promise<UploadResult> {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  return fetch("/api/standard-docs", { method: "POST", body: form }).then((r) =>
    handle<UploadResult>(r),
  );
}

export function deleteStandardDoc(id: number): Promise<void> {
  return fetch(`/api/standard-docs/${id}`, { method: "DELETE" }).then((r) => handle<void>(r));
}

export function downloadStandardDocUrl(id: number): string {
  return `/api/standard-docs/${id}/download`;
}

export function recognizeStandardDoc(id: number): Promise<RecognizeResult> {
  return fetch(`/api/standard-docs/${id}/recognize`, { method: "POST" }).then((r) =>
    handle<RecognizeResult>(r),
  );
}

export interface Clause {
  id: number;
  clause_no: string;
  clause_text: string | null;
  source_segment_id: number | null;
  page_no: number | null;
  locator: Record<string, unknown> | null;
}

export function listClauses(docId: number): Promise<Clause[]> {
  return fetch(`/api/standard-docs/${docId}/clauses`).then((r) => handle<Clause[]>(r));
}

export interface Rule {
  id: number;
  rule_code: string;
  version: string;
  name: string;
  logic: string | null;
  dimension_code: string;
  dimension_name: string;
  decision_type: string;
  disposition: string;
  binding_class: string;
  source_clause_id: number | null;
  clause_no: string | null;
  clause_text: string | null;
  page_no: number | null;
  locator: Record<string, unknown> | null;
}

export function listRules(docId: number): Promise<Rule[]> {
  return fetch(`/api/standard-docs/${docId}/rules`).then((r) => handle<Rule[]>(r));
}
