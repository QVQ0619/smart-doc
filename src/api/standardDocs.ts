export interface StandardDoc {
  id: number;
  doc_code: string;
  title: string;
  file_name: string;
  size_bytes: number | null;
  mime_type: string | null;
  created_at: string | null;
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
