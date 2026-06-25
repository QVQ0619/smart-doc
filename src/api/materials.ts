export interface MaterialFileBrief {
  material_file_id: number;
  file_name: string;
  material_category: string;
  recognition_status: string;
  segment_count: number;
}
export interface MaterialPackage {
  package_id: number;
  created_at: string | null;
  file_count: number;
  files: MaterialFileBrief[];
}
export interface MaterialSegment {
  id: number;
  page_no: number | null;
  locator: Record<string, unknown> | null;
  segment_type: string;
  content_text: string | null;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export function listMaterialPackages(): Promise<MaterialPackage[]> {
  return fetch("/api/material-packages").then((r) => handle<MaterialPackage[]>(r));
}
export function listMaterialSegments(id: number): Promise<MaterialSegment[]> {
  return fetch(`/api/material-files/${id}/segments`).then((r) => handle<MaterialSegment[]>(r));
}
