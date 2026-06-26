import { create } from "zustand";

const KEY = "side-menu-collapsed";

function readInitial(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

interface MenuCollapseState {
  collapsed: boolean;
  toggle: () => void;
}

export const useMenuCollapseStore = create<MenuCollapseState>((set, get) => ({
  collapsed: readInitial(),
  toggle: () => {
    const next = !get().collapsed;
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* localStorage 不可用时仅在内存切换 */
    }
    set({ collapsed: next });
  },
}));
