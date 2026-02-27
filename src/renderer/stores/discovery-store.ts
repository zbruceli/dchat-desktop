import { create } from "zustand";
import type { DiscoveredGroup } from "../../shared/types";

interface DiscoveryState {
  groups: DiscoveredGroup[];
  categories: string[];
  selectedCategory: string | null;
  searchQuery: string;
  loading: boolean;
  refreshing: boolean;
  loadGroups: () => Promise<void>;
  loadCategories: () => Promise<void>;
  setSelectedCategory: (category: string | null) => void;
  setSearchQuery: (query: string) => void;
  refresh: () => Promise<void>;
  createGroup: (params: { name: string; description?: string; category?: string; avatarPath?: string }) => Promise<void>;
  handleDiscoveryUpdate: (groups: DiscoveredGroup[]) => void;
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  groups: [],
  categories: [],
  selectedCategory: null,
  searchQuery: "",
  loading: false,
  refreshing: false,

  loadGroups: async () => {
    set({ loading: true });
    try {
      const groups = await window.dchat.discovery.list();
      set({ groups, loading: false });
    } catch (err) {
      console.error("Failed to load discovered groups:", err);
      set({ loading: false });
    }
  },

  loadCategories: async () => {
    try {
      const categories = await window.dchat.discovery.getCategories();
      set({ categories });
    } catch (err) {
      console.error("Failed to load categories:", err);
    }
  },

  setSelectedCategory: (category: string | null) => {
    set({ selectedCategory: category });
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  refresh: async () => {
    set({ refreshing: true });
    try {
      const groups = await window.dchat.discovery.refresh();
      const categories = await window.dchat.discovery.getCategories();
      set({ groups, categories, refreshing: false });
    } catch (err) {
      console.error("Failed to refresh discovery:", err);
      set({ refreshing: false });
    }
  },

  createGroup: async (params) => {
    await window.dchat.discovery.createGroup(params);
    const groups = await window.dchat.discovery.list();
    const categories = await window.dchat.discovery.getCategories();
    set({ groups, categories });
  },

  handleDiscoveryUpdate: (groups: DiscoveredGroup[]) => {
    set({ groups });
    // Also refresh categories
    window.dchat.discovery.getCategories().then((categories) => {
      set({ categories });
    }).catch(() => {});
  },
}));

export function selectFilteredGroups(state: DiscoveryState): DiscoveredGroup[] {
  let filtered = state.groups;

  if (state.selectedCategory) {
    filtered = filtered.filter((g) => g.category === state.selectedCategory);
  }

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase().trim();
    filtered = filtered.filter(
      (g) =>
        g.topicName.toLowerCase().includes(q) ||
        (g.description && g.description.toLowerCase().includes(q)),
    );
  }

  return filtered;
}
