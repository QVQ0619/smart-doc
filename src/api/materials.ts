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

export interface StructMember { id: number; member_role: string; name: string; title: string | null; unit_name: string | null; source_segment_id: number | null; }
export interface StructCoopUnit { id: number; coop_type: string; unit_name: string; task_desc: string | null; applied_fund: number | null; source_segment_id: number | null; }
export interface StructBudgetItem { id: number; category: string; item_name: string; amount: number; source_segment_id: number | null; }
export interface StructAttachment { id: number; attachment_type: string; is_present: boolean; source_segment_id: number | null; }
export interface StructField { id: number; field_code: string; field_value: string | null; extraction_status: string; source_segment_id: number | null; }
export interface PackageStructured {
  package_id: number;
  members: StructMember[];
  coop_units: StructCoopUnit[];
  budget_items: StructBudgetItem[];
  attachments: StructAttachment[];
  fields: StructField[];
}
export function getPackageStructured(packageId: number): Promise<PackageStructured> {
  return fetch(`/api/packages/${packageId}/structured`).then((r) => handle<PackageStructured>(r));
}
