import { create } from "zustand";
import type { ClientStatus } from "../../shared/types";

interface ClientState {
  status: ClientStatus;
  error: string | null;
  connect: (seed: string) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  setStatus: (status: ClientStatus) => void;
  setError: (error: string | null) => void;
}

export const useClientStore = create<ClientState>((set) => ({
  status: { state: "disconnected" },
  error: null,

  connect: async (seed: string) => {
    set({ error: null });
    try {
      const status = await window.dchat.client.connect(seed);
      set({ status });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      set({ error: message, status: { state: "disconnected" } });
      throw err;
    }
  },

  disconnect: async () => {
    await window.dchat.client.disconnect();
    set({ status: { state: "disconnected" }, error: null });
  },

  refreshStatus: async () => {
    const status = await window.dchat.client.getStatus();
    set({ status });
  },

  setStatus: (status: ClientStatus) => set({ status }),
  setError: (error: string | null) => set({ error }),
}));
