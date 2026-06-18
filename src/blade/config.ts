const DEFAULT_BASE_URL = "http://115.190.152.1:8020";

export function getBaseUrl(): string {
  const raw = import.meta.env.VITE_BLADE_API_BASE?.trim();
  const base = raw && raw.length > 0 ? raw : DEFAULT_BASE_URL;
  return base.replace(/\/+$/, "");
}

export function getToken(): string {
  return import.meta.env.VITE_BLADE_TOKEN?.trim() ?? "";
}

export function hasToken(): boolean {
  return getToken().length > 0;
}

export function getSolutionId(): string | undefined {
  const v = import.meta.env.VITE_BLADE_SOLUTION_ID?.trim();
  return v && v.length > 0 ? v : undefined;
}

export function getBizRoleId(): string | undefined {
  const v = import.meta.env.VITE_BLADE_BIZ_ROLE_ID?.trim();
  return v && v.length > 0 ? v : undefined;
}
