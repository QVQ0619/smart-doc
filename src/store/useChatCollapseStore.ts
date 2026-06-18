import { create } from "zustand";

const KEY = "chat-panel-collapsed";

function readInitial(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

interface ChatCollapseState {
  collapsed: boolean;
  toggle: () => void;
}

export const useChatCollapseStore = create<ChatCollapseState>((set, get) => ({
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
