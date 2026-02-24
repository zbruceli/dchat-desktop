import { create } from "zustand";

type NavItem = "chat" | "contacts" | "discover" | "wallet" | "settings";

interface NavState {
  activeNav: NavItem;
  setActiveNav: (nav: NavItem) => void;
}

export const useNavStore = create<NavState>((set) => ({
  activeNav: "chat",
  setActiveNav: (nav: NavItem) => set({ activeNav: nav }),
}));
