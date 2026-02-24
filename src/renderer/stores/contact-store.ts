import { create } from "zustand";
import type { Contact } from "../../shared/types";

export type ContactSortMode = "name" | "recent";

interface ContactState {
  contacts: Contact[];
  searchQuery: string;
  sortMode: ContactSortMode;
  setSearchQuery: (query: string) => void;
  setSortMode: (mode: ContactSortMode) => void;
  loadContacts: () => Promise<void>;
  addContact: (address: string, name?: string) => Promise<void>;
  deleteContact: (address: string) => Promise<void>;
  updateContact: (address: string, name: string) => Promise<Contact | null>;
  pickAndSetContactAvatar: (address: string) => Promise<Contact | null>;
  setBurnOptions: (address: string, burnAfterSeconds: number) => Promise<Contact | null>;
  handleContactUpdate: (contact: Contact) => void;
}

export function filterAndSortContacts(
  contacts: Contact[],
  searchQuery: string,
  sortMode: ContactSortMode,
): Contact[] {
  let filtered = contacts;

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filtered = contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q),
    );
  }

  const sorted = [...filtered];
  if (sortMode === "name") {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    sorted.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  return sorted;
}

export const useContactStore = create<ContactState>((set) => ({
  contacts: [],
  searchQuery: "",
  sortMode: "name",

  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setSortMode: (mode: ContactSortMode) => set({ sortMode: mode }),

  loadContacts: async () => {
    const contacts = await window.dchat.contact.list();
    set({ contacts });
  },

  addContact: async (address: string, name?: string) => {
    await window.dchat.contact.add(address, name);
    const contacts = await window.dchat.contact.list();
    set({ contacts });
  },

  deleteContact: async (address: string) => {
    await window.dchat.contact.delete(address);
    const contacts = await window.dchat.contact.list();
    set({ contacts });
  },

  updateContact: async (address: string, name: string) => {
    const updated = await window.dchat.contact.update(address, name);
    if (updated) {
      const contacts = await window.dchat.contact.list();
      set({ contacts });
    }
    return updated;
  },

  pickAndSetContactAvatar: async (address: string) => {
    const filePath = await window.dchat.contact.pickAvatar();
    if (!filePath) return null;
    const updated = await window.dchat.contact.setAvatar(address, filePath);
    if (updated) {
      const contacts = await window.dchat.contact.list();
      set({ contacts });
    }
    return updated;
  },

  setBurnOptions: async (address: string, burnAfterSeconds: number) => {
    const updated = await window.dchat.contact.setBurnOptions(address, burnAfterSeconds);
    if (updated) {
      const contacts = await window.dchat.contact.list();
      set({ contacts });
    }
    return updated;
  },

  handleContactUpdate: (contact: Contact) => {
    set((state) => {
      const idx = state.contacts.findIndex((c) => c.address === contact.address);
      if (idx >= 0) {
        const contacts = [...state.contacts];
        contacts[idx] = contact;
        return { contacts };
      }
      return { contacts: [...state.contacts, contact] };
    });
  },
}));
