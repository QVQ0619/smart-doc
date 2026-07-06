import { create } from "zustand";
import type { RouteKey } from "../layout/menuConfig";

export type Nav =
  | { name: RouteKey }
  | { name: "batch-detail"; batchId: number; batchTitle: string }
  | { name: "rule-detail"; docId: number; docTitle: string; batchId?: number; batchTitle?: string }
  | { name: "task-review"; taskId: number; taskName: string };

interface RouteState {
  nav: Nav;
  navigate: (nav: Nav) => void;
}

export const useRouteStore = create<RouteState>((set) => ({
  nav: { name: "dashboard" },
  navigate: (nav) => set({ nav }),
}));
