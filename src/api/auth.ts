import { authHeaders, handle, setToken } from "./client";

export interface UserInfo {
  id: number;
  username: string;
  display_name: string | null;
  roles: string[];
  primary_role: string | null;
}

export interface LoginResult {
  token: string;
  user: UserInfo;
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await handle<LoginResult>(res);
  setToken(data.token);
  return data;
}

export async function getMe(): Promise<UserInfo> {
  const res = await fetch("/api/auth/me", { headers: authHeaders() });
  return handle<UserInfo>(res);
}
