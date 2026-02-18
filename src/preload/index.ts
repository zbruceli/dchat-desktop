import { contextBridge, ipcRenderer } from "electron";
import type {
  Message,
  Contact,
  Session,
  WalletInfo,
  ClientStatus,
  Topic,
  TopicSubscriber,
} from "../shared/types";

const api = {
  app: {
    getInfo: (): Promise<{ name: string; version: string }> =>
      ipcRenderer.invoke("app:getInfo"),
  },
  client: {
    connect: (seed: string): Promise<ClientStatus> =>
      ipcRenderer.invoke("client:connect", seed),
    disconnect: (): Promise<void> =>
      ipcRenderer.invoke("client:disconnect"),
    getStatus: (): Promise<ClientStatus> =>
      ipcRenderer.invoke("client:getStatus"),
    echoTest: (): Promise<{ success: boolean; rtt: number; error?: string }> =>
      ipcRenderer.invoke("client:echoTest"),
    onStatusChange: (callback: (status: ClientStatus) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: ClientStatus) =>
        callback(status);
      ipcRenderer.on("client:onStatusChange", handler);
      return () => ipcRenderer.removeListener("client:onStatusChange", handler);
    },
  },
  chat: {
    sendMessage: (to: string, content: string): Promise<Message> =>
      ipcRenderer.invoke("chat:sendMessage", to, content),
    sendImage: (to: string, filePath: string): Promise<Message> =>
      ipcRenderer.invoke("chat:sendImage", to, filePath),
    sendAudio: (to: string, audioBuffer: ArrayBuffer, durationSeconds: number): Promise<Message> =>
      ipcRenderer.invoke("chat:sendAudio", to, audioBuffer, durationSeconds),
    pickImage: (): Promise<string | null> =>
      ipcRenderer.invoke("chat:pickImage"),
    downloadImage: (messageId: string): Promise<void> =>
      ipcRenderer.invoke("chat:downloadImage", messageId),
    downloadAudio: (messageId: string): Promise<void> =>
      ipcRenderer.invoke("chat:downloadAudio", messageId),
    pickFile: (): Promise<string | null> =>
      ipcRenderer.invoke("chat:pickFile"),
    sendFile: (to: string, filePath: string): Promise<Message> =>
      ipcRenderer.invoke("chat:sendFile", to, filePath),
    downloadFile: (messageId: string): Promise<void> =>
      ipcRenderer.invoke("chat:downloadFile", messageId),
    openFile: (localFilePath: string): Promise<string> =>
      ipcRenderer.invoke("chat:openFile", localFilePath),
    getMessages: (sessionId: string): Promise<Message[]> =>
      ipcRenderer.invoke("chat:getMessages", sessionId),
    startSession: (targetAddress: string): Promise<{ sessionId: string }> =>
      ipcRenderer.invoke("chat:startSession", targetAddress),
    markRead: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke("chat:markRead", sessionId),
    onMessage: (callback: (message: Message) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, message: Message) =>
        callback(message);
      ipcRenderer.on("chat:onMessage", handler);
      return () => ipcRenderer.removeListener("chat:onMessage", handler);
    },
  },
  contact: {
    add: (address: string, name?: string): Promise<Contact> =>
      ipcRenderer.invoke("contact:add", address, name),
    list: (): Promise<Contact[]> =>
      ipcRenderer.invoke("contact:list"),
    get: (address: string): Promise<Contact | null> =>
      ipcRenderer.invoke("contact:get", address),
    delete: (address: string): Promise<void> =>
      ipcRenderer.invoke("contact:delete", address),
  },
  wallet: {
    create: (password: string): Promise<WalletInfo> =>
      ipcRenderer.invoke("wallet:create", password),
    import: (keystore: string, password: string): Promise<WalletInfo> =>
      ipcRenderer.invoke("wallet:import", keystore, password),
    getBalance: (address: string): Promise<string> =>
      ipcRenderer.invoke("wallet:getBalance", address),
    saveSeed: (seed: string, walletAddress: string): Promise<void> =>
      ipcRenderer.invoke("wallet:saveSeed", seed, walletAddress),
    loadSeed: (): Promise<{ seed: string; walletAddress: string } | null> =>
      ipcRenderer.invoke("wallet:loadSeed"),
    clearSeed: (): Promise<void> =>
      ipcRenderer.invoke("wallet:clearSeed"),
  },
  session: {
    list: (): Promise<Session[]> =>
      ipcRenderer.invoke("session:list"),
    get: (id: string): Promise<Session | null> =>
      ipcRenderer.invoke("session:get", id),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke("session:delete", id),
    onUpdate: (callback: (session: Session) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, session: Session) =>
        callback(session);
      ipcRenderer.on("session:onUpdate", handler);
      return () => ipcRenderer.removeListener("session:onUpdate", handler);
    },
    onDelete: (callback: (sessionId: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, sessionId: string) =>
        callback(sessionId);
      ipcRenderer.on("session:onDelete", handler);
      return () => ipcRenderer.removeListener("session:onDelete", handler);
    },
  },
  settings: {
    get: (key: string): Promise<unknown> =>
      ipcRenderer.invoke("settings:get", key),
    set: (key: string, value: unknown): Promise<void> =>
      ipcRenderer.invoke("settings:set", key, value),
  },
  topic: {
    create: (name: string): Promise<Topic> =>
      ipcRenderer.invoke("topic:create", name),
    join: (name: string): Promise<Topic> =>
      ipcRenderer.invoke("topic:join", name),
    leave: (name: string): Promise<void> =>
      ipcRenderer.invoke("topic:leave", name),
    list: (): Promise<Topic[]> =>
      ipcRenderer.invoke("topic:list"),
    get: (name: string): Promise<Topic | null> =>
      ipcRenderer.invoke("topic:get", name),
    getSubscribers: (name: string): Promise<TopicSubscriber[]> =>
      ipcRenderer.invoke("topic:getSubscribers", name),
    refreshSubscribers: (name: string): Promise<string[]> =>
      ipcRenderer.invoke("topic:refreshSubscribers", name),
    sendMessage: (name: string, content: string, contentType?: string): Promise<Message> =>
      ipcRenderer.invoke("topic:sendMessage", name, content, contentType),
    sendImage: (name: string, filePath: string): Promise<Message> =>
      ipcRenderer.invoke("topic:sendImage", name, filePath),
    onUpdate: (callback: (topic: Topic) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, topic: Topic) =>
        callback(topic);
      ipcRenderer.on("topic:onUpdate", handler);
      return () => ipcRenderer.removeListener("topic:onUpdate", handler);
    },
    onDelete: (callback: (topicId: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, topicId: string) =>
        callback(topicId);
      ipcRenderer.on("topic:onDelete", handler);
      return () => ipcRenderer.removeListener("topic:onDelete", handler);
    },
  },
};

contextBridge.exposeInMainWorld("dchat", api);

export type DchatAPI = typeof api;
