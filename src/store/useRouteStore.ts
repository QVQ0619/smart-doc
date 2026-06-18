import { create } from "zustand";
import type { RouteKey } from "../layout/menuConfig";

interface RouteState {
  route: RouteKey;
  setRoute: (route: RouteKey) => void;
}

export const useRouteStore = create<RouteState>((set) => ({
  route: "home",
  setRoute: (route) => set({ route }),
}));
