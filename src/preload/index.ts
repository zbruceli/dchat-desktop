import { contextBridge, ipcRenderer } from "electron";
import type {
  Message,
  Contact,
  Session,
  ClientStatus,
  Topic,
  TopicSubscriber,
  Profile,
  PrivateGroup,
  PrivateGroupMember,
  DiscoveredGroup,
} from "../shared/types";

const api = {
  app: {
    getInfo: (): Promise<{ name: string; version: string }> =>
      ipcRenderer.invoke("app:getInfo"),
  },
  client: {
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
    setActiveSession: (sessionId: string | null): Promise<void> =>
      ipcRenderer.invoke("chat:setActiveSession", sessionId),
    onMessage: (callback: (message: Message) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, message: Message) =>
        callback(message);
      ipcRenderer.on("chat:onMessage", handler);
      return () => ipcRenderer.removeListener("chat:onMessage", handler);
    },
    onNavigateToSession: (callback: (sessionId: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, sessionId: string) =>
        callback(sessionId);
      ipcRenderer.on("chat:onNavigateToSession", handler);
      return () => ipcRenderer.removeListener("chat:onNavigateToSession", handler);
    },
    onMessageBurned: (callback: (data: { messageId: string; sessionId: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { messageId: string; sessionId: string }) =>
        callback(data);
      ipcRenderer.on("chat:onMessageBurned", handler);
      return () => ipcRenderer.removeListener("chat:onMessageBurned", handler);
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
    update: (address: string, name?: string): Promise<Contact | null> =>
      ipcRenderer.invoke("contact:update", address, name),
    pickAvatar: (): Promise<string | null> =>
      ipcRenderer.invoke("contact:pickAvatar"),
    setAvatar: (address: string, filePath: string): Promise<Contact | null> =>
      ipcRenderer.invoke("contact:setAvatar", address, filePath),
    setBurnOptions: (address: string, burnAfterSeconds: number): Promise<Contact | null> =>
      ipcRenderer.invoke("contact:setBurnOptions", address, burnAfterSeconds),
    onUpdate: (callback: (contact: Contact) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, contact: Contact) =>
        callback(contact);
      ipcRenderer.on("contact:onUpdate", handler);
      return () => ipcRenderer.removeListener("contact:onUpdate", handler);
    },
  },
  wallet: {
    createAndConnect: (password: string): Promise<{ address: string; publicKey: string }> =>
      ipcRenderer.invoke("wallet:createAndConnect", password),
    importAndConnect: (keystore: string, password: string): Promise<{ address: string; publicKey: string }> =>
      ipcRenderer.invoke("wallet:importAndConnect", keystore, password),
    restoreAndConnect: (password: string): Promise<{ address: string; publicKey: string }> =>
      ipcRenderer.invoke("wallet:restoreAndConnect", password),
    autoConnect: (): Promise<{ address: string; publicKey: string } | null> =>
      ipcRenderer.invoke("wallet:autoConnect"),
    hasSaved: (): Promise<boolean> =>
      ipcRenderer.invoke("wallet:hasSaved"),
    logout: (): Promise<void> =>
      ipcRenderer.invoke("wallet:logout"),
    getBalance: (address: string): Promise<string> =>
      ipcRenderer.invoke("wallet:getBalance", address),
    transfer: (
      toAddress: string,
      amount: string,
      fee: string,
    ): Promise<{ txnHash: string }> =>
      ipcRenderer.invoke("wallet:transfer", toAddress, amount, fee),
    addressFromClient: (clientAddress: string): Promise<string> =>
      ipcRenderer.invoke("wallet:addressFromClient", clientAddress),
    exportKeystore: (): Promise<{ success: boolean; filePath?: string }> =>
      ipcRenderer.invoke("wallet:exportKeystore"),
    importKeystoreFile: (): Promise<string | null> =>
      ipcRenderer.invoke("wallet:importKeystoreFile"),
  },
  database: {
    export: (password: string): Promise<{ success: boolean; filePath?: string }> =>
      ipcRenderer.invoke("database:export", password),
    restore: (password: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("database:restore", password),
  },
  session: {
    list: (): Promise<Session[]> =>
      ipcRenderer.invoke("session:list"),
    get: (id: string): Promise<Session | null> =>
      ipcRenderer.invoke("session:get", id),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke("session:delete", id),
    setMuted: (id: string, muted: boolean): Promise<void> =>
      ipcRenderer.invoke("session:setMuted", id, muted),
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
    sendAudio: (name: string, audioBuffer: ArrayBuffer, durationSeconds: number): Promise<Message> =>
      ipcRenderer.invoke("topic:sendAudio", name, audioBuffer, durationSeconds),
    sendFile: (name: string, filePath: string): Promise<Message> =>
      ipcRenderer.invoke("topic:sendFile", name, filePath),
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
  profile: {
    get: (): Promise<Profile> =>
      ipcRenderer.invoke("profile:get"),
    setNickname: (nickname: string): Promise<Profile> =>
      ipcRenderer.invoke("profile:setNickname", nickname),
    pickAvatar: (): Promise<string | null> =>
      ipcRenderer.invoke("profile:pickAvatar"),
    setAvatar: (filePath: string): Promise<Profile> =>
      ipcRenderer.invoke("profile:setAvatar", filePath),
    onUpdate: (callback: (profile: Profile) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, profile: Profile) =>
        callback(profile);
      ipcRenderer.on("profile:onUpdate", handler);
      return () => ipcRenderer.removeListener("profile:onUpdate", handler);
    },
  },
  privateGroup: {
    create: (name: string): Promise<PrivateGroup> =>
      ipcRenderer.invoke("privateGroup:create", name),
    list: (): Promise<PrivateGroup[]> =>
      ipcRenderer.invoke("privateGroup:list"),
    get: (groupId: string): Promise<PrivateGroup | null> =>
      ipcRenderer.invoke("privateGroup:get", groupId),
    invite: (groupId: string, targetAddress: string): Promise<void> =>
      ipcRenderer.invoke("privateGroup:invite", groupId, targetAddress),
    accept: (groupId: string): Promise<void> =>
      ipcRenderer.invoke("privateGroup:accept", groupId),
    quit: (groupId: string): Promise<void> =>
      ipcRenderer.invoke("privateGroup:quit", groupId),
    kick: (groupId: string, targetAddress: string): Promise<void> =>
      ipcRenderer.invoke("privateGroup:kick", groupId, targetAddress),
    getMembers: (groupId: string): Promise<PrivateGroupMember[]> =>
      ipcRenderer.invoke("privateGroup:getMembers", groupId),
    refreshMembers: (groupId: string): Promise<void> =>
      ipcRenderer.invoke("privateGroup:refreshMembers", groupId),
    sendMessage: (groupId: string, content: string, contentType?: string): Promise<Message> =>
      ipcRenderer.invoke("privateGroup:sendMessage", groupId, content, contentType),
    sendImage: (groupId: string, filePath: string): Promise<Message> =>
      ipcRenderer.invoke("privateGroup:sendImage", groupId, filePath),
    sendAudio: (groupId: string, audioBuffer: ArrayBuffer, durationSeconds: number): Promise<Message> =>
      ipcRenderer.invoke("privateGroup:sendAudio", groupId, audioBuffer, durationSeconds),
    sendFile: (groupId: string, filePath: string): Promise<Message> =>
      ipcRenderer.invoke("privateGroup:sendFile", groupId, filePath),
    onUpdate: (callback: (group: PrivateGroup) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, group: PrivateGroup) =>
        callback(group);
      ipcRenderer.on("privateGroup:onUpdate", handler);
      return () => ipcRenderer.removeListener("privateGroup:onUpdate", handler);
    },
    onDelete: (callback: (groupId: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, groupId: string) =>
        callback(groupId);
      ipcRenderer.on("privateGroup:onDelete", handler);
      return () => ipcRenderer.removeListener("privateGroup:onDelete", handler);
    },
  },
  discovery: {
    list: (): Promise<DiscoveredGroup[]> =>
      ipcRenderer.invoke("discovery:list"),
    getCategories: (): Promise<string[]> =>
      ipcRenderer.invoke("discovery:getCategories"),
    refresh: (): Promise<DiscoveredGroup[]> =>
      ipcRenderer.invoke("discovery:refresh"),
    onUpdate: (callback: (groups: DiscoveredGroup[]) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, groups: DiscoveredGroup[]) =>
        callback(groups);
      ipcRenderer.on("discovery:onUpdate", handler);
      return () => ipcRenderer.removeListener("discovery:onUpdate", handler);
    },
  },
};

contextBridge.exposeInMainWorld("dchat", api);

export type DchatAPI = typeof api;
