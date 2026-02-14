import { create } from "zustand";
import type { ClientStatus } from "../../shared/types";

interface ClientState {
  status: ClientStatus;
  walletAddress: string | null;
  autoConnectAttempted: boolean;
  error: string | null;
  connect: (seed: string) => Promise<void>;
  disconnect: () => Promise<void>;
  autoConnect: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  setStatus: (status: ClientStatus) => void;
  setWalletAddress: (address: string) => void;
  setError: (error: string | null) => void;
  echoTest: () => Promise<{ success: boolean; rtt: number; error?: string }>;
}

export const useClientStore = create<ClientState>((set, get) => ({
  status: { state: "disconnected" },
  walletAddress: null,
  autoConnectAttempted: false,
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
    await window.dchat.wallet.clearSeed();
    await window.dchat.client.disconnect();
    set({ status: { state: "disconnected" }, walletAddress: null, error: null });
  },

  autoConnect: async () => {
    if (get().autoConnectAttempted) return;
    set({ autoConnectAttempted: true });

    try {
      const saved = await window.dchat.wallet.loadSeed();
      if (!saved) return;

      set({ error: null, status: { state: "connecting" } });
      if (saved.walletAddress) {
        set({ walletAddress: saved.walletAddress });
      }

      const status = await window.dchat.client.connect(saved.seed);
      set({ status });
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
  setWalletAddress: (address: string) => set({ walletAddress: address }),
  setError: (error: string | null) => set({ error }),

  echoTest: async () => {
    return await window.dchat.client.echoTest();
  },
}));
