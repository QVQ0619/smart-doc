import { create } from "zustand";
import type { UserInfo } from "../api/auth";
import { getToken, setToken } from "../api/client";

// 管理员类角色(粗粒度门控);与后端 ADMIN_ROLES 保持一致。
export const ADMIN_ROLES = ["sys_admin", "research_admin"];

export function isAdminUser(u: UserInfo | null): boolean {
  return !!u && u.roles.some((r) => ADMIN_ROLES.includes(r));
}

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  isAdmin: boolean;
  setAuth: (token: string, user: UserInfo) => void;
  setUser: (user: UserInfo) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: getToken(),
  user: null,
  isAdmin: false,
  setAuth: (token, user) => {
    setToken(token);
    set({ token, user, isAdmin: isAdminUser(user) });
  },
  setUser: (user) => set({ user, isAdmin: isAdminUser(user) }),
  logout: () => {
    setToken(null);
    set({ token: null, user: null, isAdmin: false });
  },
}));
