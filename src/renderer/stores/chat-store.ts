import { create } from "zustand";
import type { Message } from "../../shared/types";

interface ChatState {
  messagesBySession: Record<string, Message[]>;
  activeSessionId: string | null;
  setActiveSession: (sessionId: string | null) => void;
  loadMessages: (sessionId: string) => Promise<void>;
  sendMessage: (to: string, content: string) => Promise<void>;
  startSession: (targetAddress: string) => Promise<string>;
  handleIncomingMessage: (message: Message) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messagesBySession: {},
  activeSessionId: null,

  setActiveSession: (sessionId: string | null) => {
    set({ activeSessionId: sessionId });
    if (sessionId) {
      get().loadMessages(sessionId);
      window.dchat.chat.markRead(sessionId).catch(console.error);
    }
  },

  loadMessages: async (sessionId: string) => {
    const messages = await window.dchat.chat.getMessages(sessionId);
    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId]: messages,
      },
    }));
  },

  sendMessage: async (to: string, content: string) => {
    await window.dchat.chat.sendMessage(to, content);
  },

  startSession: async (targetAddress: string) => {
    const { sessionId } = await window.dchat.chat.startSession(targetAddress);
    // Reload sessions will happen via push event, just load messages and set active
    set({ activeSessionId: sessionId });
    const messages = await window.dchat.chat.getMessages(sessionId);
    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId]: messages,
      },
    }));
    return sessionId;
  },

  handleIncomingMessage: (message: Message) => {
    set((state) => {
      const sessionMessages = state.messagesBySession[message.sessionId] ?? [];
      const existingIdx = sessionMessages.findIndex((m) => m.id === message.id);

      let updatedMessages: Message[];
      if (existingIdx >= 0) {
        // Update existing message (e.g. status change)
        updatedMessages = [...sessionMessages];
        updatedMessages[existingIdx] = message;
      } else {
        updatedMessages = [...sessionMessages, message];
      }

      return {
        messagesBySession: {
          ...state.messagesBySession,
          [message.sessionId]: updatedMessages,
        },
      };
    });
  },
}));
