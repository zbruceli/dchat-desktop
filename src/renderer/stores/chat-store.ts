import { create } from "zustand";
import type { Message } from "../../shared/types";

interface ChatState {
  messagesBySession: Record<string, Message[]>;
  activeSessionId: string | null;
  setActiveSession: (sessionId: string | null) => void;
  loadMessages: (sessionId: string) => Promise<void>;
  sendMessage: (to: string, content: string) => Promise<void>;
  sendImage: (to: string) => Promise<void>;
  sendAudio: (to: string, audioBuffer: ArrayBuffer, durationSeconds: number) => Promise<void>;
  sendFile: (to: string) => Promise<void>;
  downloadImage: (messageId: string) => Promise<void>;
  downloadAudio: (messageId: string) => Promise<void>;
  downloadFile: (messageId: string) => Promise<void>;
  openFile: (localFilePath: string) => Promise<void>;
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

  sendImage: async (to: string) => {
    try {
      const filePath = await window.dchat.chat.pickImage();
      if (!filePath) return;
      await window.dchat.chat.sendImage(to, filePath);
    } catch (err) {
      console.error("sendImage failed:", err);
    }
  },

  sendAudio: async (to: string, audioBuffer: ArrayBuffer, durationSeconds: number) => {
    try {
      await window.dchat.chat.sendAudio(to, audioBuffer, durationSeconds);
    } catch (err) {
      console.error("sendAudio failed:", err);
    }
  },

  sendFile: async (to: string) => {
    try {
      const filePath = await window.dchat.chat.pickFile();
      if (!filePath) return;
      await window.dchat.chat.sendFile(to, filePath);
    } catch (err) {
      console.error("sendFile failed:", err);
    }
  },

  downloadImage: async (messageId: string) => {
    await window.dchat.chat.downloadImage(messageId);
  },

  downloadAudio: async (messageId: string) => {
    await window.dchat.chat.downloadAudio(messageId);
  },

  downloadFile: async (messageId: string) => {
    await window.dchat.chat.downloadFile(messageId);
  },

  openFile: async (localFilePath: string) => {
    await window.dchat.chat.openFile(localFilePath);
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
