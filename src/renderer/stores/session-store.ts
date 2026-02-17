import { create } from "zustand";
import type { Session } from "../../shared/types";

interface SessionState {
  sessions: Session[];
  loadSessions: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  handleSessionUpdate: (session: Session) => void;
  handleSessionDelete: (sessionId: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],

  loadSessions: async () => {
    const sessions = await window.dchat.session.list();
    set({ sessions });
  },

  deleteSession: async (id: string) => {
    await window.dchat.session.delete(id);
    const sessions = await window.dchat.session.list();
    set({ sessions });
  },

  handleSessionUpdate: (session: Session) => {
    set((state) => {
      const idx = state.sessions.findIndex((s) => s.id === session.id);
      let updated: Session[];
      if (idx >= 0) {
        updated = [...state.sessions];
        updated[idx] = session;
      } else {
        updated = [session, ...state.sessions];
      }
      // Keep sorted by lastMessageAt descending
      updated.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
      return { sessions: updated };
    });
  },

  handleSessionDelete: (sessionId: string) => {
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
    }));
  },
}));
