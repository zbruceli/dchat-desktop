import { create } from "zustand";
import type { Message } from "../../shared/types";

interface ChatState {
  messagesBySession: Record<string, Message[]>;
  activeSessionId: string | null;
  setActiveSession: (sessionId: string | null) => void;
  loadMessages: (sessionId: string) => Promise<void>;
  sendMessage: (to: string, content: string) => Promise<void>;
  handleIncomingMessage: (message: Message) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messagesBySession: {},
  activeSessionId: null,

  setActiveSession: (sessionId: string | null) => {
    set({ activeSessionId: sessionId });
    if (sessionId) {
      get().loadMessages(sessionId);
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
