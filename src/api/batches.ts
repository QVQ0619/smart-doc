import type { StandardDoc } from "./standardDocs";
import type { MaterialPackage } from "./materials";

export interface Batch {
  id: number;
  batch_no: string;
  project_type_name: string;
  stage_name: string;
  status: string;
  declare_period: string | null;
  material_count: number;
  rule_doc_count: number;
  rule_count: number;
}

export interface BatchDetail extends Batch {
  rule_docs: StandardDoc[];
}

export interface BatchCreate {
  batch_no: string;
  declare_period?: string | null;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// 写/变更请求带上共享密钥（与后端 X-API-Key 鉴权对应）；未配置则不带。
function authHeaders(): Record<string, string> {
  const k = import.meta.env.VITE_SMART_DOC_API_KEY?.trim();
  return k ? { "X-API-Key": k } : {};
}

export function listBatches(): Promise<Batch[]> {
  return fetch("/api/batches").then((r) => handle<Batch[]>(r));
}

export function createBatch(body: BatchCreate): Promise<Batch> {
  return fetch("/api/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  }).then((r) => handle<Batch>(r));
}

export function getBatchDetail(id: number): Promise<BatchDetail> {
  return fetch(`/api/batches/${id}`).then((r) => handle<BatchDetail>(r));
}

export function bindRuleDocs(
  id: number,
  standard_doc_ids: number[],
): Promise<{ bound_count: number }> {
  return fetch(`/api/batches/${id}/bind-rule-docs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ standard_doc_ids }),
  }).then((r) => handle<{ bound_count: number }>(r));
}

export function listBatchStandardDocs(id: number): Promise<StandardDoc[]> {
  return fetch(`/api/batches/${id}/standard-docs`).then((r) =>
    handle<StandardDoc[]>(r),
  );
}

export function listBatchPackages(id: number): Promise<MaterialPackage[]> {
  return fetch(`/api/batches/${id}/packages`).then((r) =>
    handle<MaterialPackage[]>(r),
  );
}
