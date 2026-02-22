import { create } from "zustand";
import type { ClientStatus } from "../../shared/types";

interface ClientState {
  status: ClientStatus;
  walletAddress: string | null;
  autoConnectAttempted: boolean;
  error: string | null;
  createAndConnect: (password: string) => Promise<void>;
  importAndConnect: (keystore: string, password: string) => Promise<void>;
  restoreAndConnect: (password: string) => Promise<void>;
  autoConnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  setStatus: (status: ClientStatus) => void;
  setError: (error: string | null) => void;
  echoTest: () => Promise<{ success: boolean; rtt: number; error?: string }>;
}

export const useClientStore = create<ClientState>((set, get) => ({
  status: { state: "disconnected" },
  walletAddress: null,
  autoConnectAttempted: false,
  error: null,

  createAndConnect: async (password: string) => {
    set({ error: null, status: { state: "connecting" } });
    try {
      const result = await window.dchat.wallet.createAndConnect(password);
      set({ walletAddress: result.address });
      // Status will be updated via push event
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      set({ error: message, status: { state: "disconnected" } });
      throw err;
    }
  },

  importAndConnect: async (keystore: string, password: string) => {
    set({ error: null, status: { state: "connecting" } });
    try {
      const result = await window.dchat.wallet.importAndConnect(keystore, password);
      set({ walletAddress: result.address });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      set({ error: message, status: { state: "disconnected" } });
      throw err;
    }
  },

  restoreAndConnect: async (password: string) => {
    set({ error: null, status: { state: "connecting" } });
    try {
      const result = await window.dchat.wallet.restoreAndConnect(password);
      set({ walletAddress: result.address });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      set({ error: message, status: { state: "disconnected" } });
      throw err;
    }
  },

  disconnect: async () => {
    await window.dchat.wallet.logout();
    set({ status: { state: "disconnected" }, walletAddress: null, error: null });
  },

  autoConnect: async () => {
    if (get().autoConnectAttempted) return;
    set({ autoConnectAttempted: true });

    try {
      const hasSaved = await window.dchat.wallet.hasSaved();
      if (!hasSaved) return;

      set({ error: null, status: { state: "connecting" } });

      const result = await window.dchat.wallet.autoConnect();
      if (result) {
        set({ walletAddress: result.address });
      }
    } catch (err) {
      console.error("Auto-connect failed:", err);
      set({ status: { state: "disconnected" } });
    }
  },

  refreshStatus: async () => {
    const status = await window.dchat.client.getStatus();
    set({ status });
  },

  setStatus: (status: ClientStatus) => set({ status }),
  setError: (error: string | null) => set({ error }),

  echoTest: async () => {
    return await window.dchat.client.echoTest();
  },
}));
