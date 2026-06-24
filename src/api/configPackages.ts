export interface ConfigPackage {
  doc_id: number;
  doc_code: string;
  title: string;
  version: string;
  rule_count: number;
  dimensions: string[];
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

// 只读 GET，无需鉴权头（与后端 GET /config-packages 一致）
export function listConfigPackages(): Promise<ConfigPackage[]> {
  return fetch("/api/config-packages").then((r) => handle<ConfigPackage[]>(r));
}
