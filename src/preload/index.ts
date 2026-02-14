import { contextBridge, ipcRenderer } from "electron";
import type {
  Message,
  Contact,
  Session,
  WalletInfo,
  ClientStatus,
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
    getMessages: (sessionId: string): Promise<Message[]> =>
      ipcRenderer.invoke("chat:getMessages", sessionId),
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
  },
  settings: {
    get: (key: string): Promise<unknown> =>
      ipcRenderer.invoke("settings:get", key),
    set: (key: string, value: unknown): Promise<void> =>
      ipcRenderer.invoke("settings:set", key, value),
  },
};

contextBridge.exposeInMainWorld("dchat", api);

export type DchatAPI = typeof api;
