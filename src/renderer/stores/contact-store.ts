import { create } from "zustand";
import type { Contact } from "../../shared/types";

interface ContactState {
  contacts: Contact[];
  loadContacts: () => Promise<void>;
  addContact: (address: string, name?: string) => Promise<void>;
  deleteContact: (address: string) => Promise<void>;
}

export const useContactStore = create<ContactState>((set) => ({
  contacts: [],

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
}));
