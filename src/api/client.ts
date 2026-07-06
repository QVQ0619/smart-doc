// 共享请求辅助:token 存取 + 统一请求头(X-API-Key + Authorization: Bearer) + 响应处理。
// 新接口(auth/users/tasks)统一走这里;旧接口保持各自实现不动。

const TOKEN_KEY = "smart_doc_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const k = import.meta.env.VITE_SMART_DOC_API_KEY?.trim();
  if (k) h["X-API-Key"] = k;
  const tok = getToken();
  if (tok) h["Authorization"] = `Bearer ${tok}`;
  return h;
}

export function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...authHeaders() };
}

export async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = typeof j.detail === "string" ? j.detail : text;
    } catch {
      /* 保留原始文本 */
    }
    throw new ApiError(res.status, detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
