import crypto from "crypto";
import { Notification, type BrowserWindow } from "electron";
import type { NknClientService } from "./nkn-client-service";
import type { ImageService } from "./image-service";
import type { AudioService } from "./audio-service";
import type { FileService } from "./file-service";
import type { TopicService } from "./topic-service";
import type { PrivateGroupService } from "./private-group-service";
import { PRIVATE_GROUP_CONTROL_TYPES } from "./private-group-service";
import type { ContactProfileService } from "./contact-profile-service";
import type { DiscoveryService } from "./discovery-service";
import type { MessageRepository } from "../db/repositories/message-repository";
import type { SessionRepository } from "../db/repositories/session-repository";
import type { ContactRepository } from "../db/repositories/contact-repository";
import { getDatabase } from "../db/database";
import type {
  Message,
  MessageData,
  MessageOptions,
  SendMessageParams,
  DiscoveryBroadcastMessage,
  AnnouncementMessage,
} from "../../shared/types";

// Content types that represent user-visible messages
const DISPLAYABLE_TYPES = new Set([
  "text",
  "textExtension",
  "image",
  "audio",
  "video",
  "file",
  "ipfs",
]);

// Content types for topic control messages
const TOPIC_CONTROL_TYPES = new Set(["topic:subscribe", "topic:unsubscribe"]);

export class ChatService {
  private imageService: ImageService | null = null;
  private audioService: AudioService | null = null;
  private fileService: FileService | null = null;
  private topicService: TopicService | null = null;
  private privateGroupService: PrivateGroupService | null = null;
  private contactProfileService: ContactProfileService | null = null;
  private discoveryService: DiscoveryService | null = null;
  private mainWindow: BrowserWindow | null = null;
  private activeSessionId: string | null = null;
  private burnSchedulerTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private nknClient: NknClientService,
    private messageRepo: MessageRepository,
    private sessionRepo: SessionRepository,
    private contactRepo: ContactRepository,
    private pushToRenderer: (channel: string, data: unknown) => void,
  ) {
    this.nknClient.on("message", (src: string, payload: string) => {
      this.handleIncomingMessage(src, payload);
    });
    this.consolidateLegacySessions();
    this.startBurnScheduler();
  }

  /** Merge duplicate sessions that share the same target_address into one. */
  private consolidateLegacySessions(): void {
    try {
      const allSessions = this.sessionRepo.findAll();
      const byTarget = new Map<string, typeof allSessions>();

      for (const session of allSessions) {
        // Skip topic and privateGroup sessions — they use their own ID schemes
        if (session.type === "topic" || session.type === "privateGroup") continue;
        const existing = byTarget.get(session.targetAddress) ?? [];
        existing.push(session);
        byTarget.set(session.targetAddress, existing);
      }

      for (const [targetAddress, sessions] of byTarget) {
        const canonicalId = `direct:${targetAddress}`;
        const hasCanonical = sessions.some((s) => s.id === canonicalId);
        const legacySessions = sessions.filter((s) => s.id !== canonicalId);

        if (legacySessions.length === 0 && hasCanonical) continue;

        // Ensure the canonical session exists first (FK constraint)
        if (!hasCanonical) {
          const best = sessions.reduce((a, b) =>
            a.lastMessageAt >= b.lastMessageAt ? a : b,
          );
          this.sessionRepo.upsert({ ...best, id: canonicalId });
        }

        // Move messages from all legacy sessions to canonical
        for (const session of legacySessions) {
          this.messageRepo.updateSessionId(session.id, canonicalId);
          this.sessionRepo.deleteById(session.id);
        }
      }
    } catch (err) {
      console.error("Failed to consolidate legacy sessions:", err);
    }
  }

  setImageService(imageService: ImageService): void {
    this.imageService = imageService;
  }

  setAudioService(audioService: AudioService): void {
    this.audioService = audioService;
  }

  setFileService(fileService: FileService): void {
    this.fileService = fileService;
  }

  setTopicService(topicService: TopicService): void {
    this.topicService = topicService;
  }

  setPrivateGroupService(privateGroupService: PrivateGroupService): void {
    this.privateGroupService = privateGroupService;
  }

  setContactProfileService(service: ContactProfileService): void {
    this.contactProfileService = service;
  }

  setDiscoveryService(service: DiscoveryService): void {
    this.discoveryService = service;
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  setActiveSessionId(sessionId: string | null): void {
    this.activeSessionId = sessionId;
  }

  startBurnScheduler(): void {
    if (this.burnSchedulerTimer) return;
    this.burnSchedulerTimer = setInterval(() => {
      try {
        const expired = this.messageRepo.findExpired(Date.now());
        const affectedSessions = new Set<string>();
        for (const msg of expired) {
          this.messageRepo.markDeleted(msg.id);
          affectedSessions.add(msg.sessionId);
          this.pushToRenderer("chat:onMessageBurned", {
            messageId: msg.id,
            sessionId: msg.sessionId,
          });
        }
        // Clear session preview for affected sessions
        for (const sessionId of affectedSessions) {
          this.sessionRepo.updateLastMessage(sessionId, "", Date.now());
          this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));
        }
      } catch (err) {
        console.error("Burn scheduler error:", err);
      }
    }, 5000);
  }

  stopBurnScheduler(): void {
    if (this.burnSchedulerTimer) {
      clearInterval(this.burnSchedulerTimer);
      this.burnSchedulerTimer = null;
    }
  }

  sendBurnOptionsToContact(address: string, burnAfterSeconds: number, burnUpdateAt: number): void {
    const myAddress = this.nknClient.getStatus().address;
    if (!myAddress) return;

    const messageData = {
      id: crypto.randomUUID(),
      contentType: "contactOptions",
      content: JSON.stringify({
        optionType: "0",
        deleteAfterSeconds: burnAfterSeconds,
        updateBurnAfterAt: burnUpdateAt,
      }),
      timestamp: Date.now(),
    };
    this.nknClient.sendMessageNoReply(address, JSON.stringify(messageData));

    // Insert system message for display
    const session = this.getOrCreateSession(address, myAddress);
    const burnLabel = burnAfterSeconds > 0
      ? this.formatBurnDuration(burnAfterSeconds)
      : "";
    const systemContent = burnAfterSeconds > 0
      ? `You enabled burn after reading (${burnLabel})`
      : "You disabled burn after reading";

    const systemMsg: Message = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      sender: myAddress,
      receiver: address,
      contentType: "contactOptions",
      content: systemContent,
      status: "sent",
      isOutbound: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.messageRepo.insert(systemMsg);
    this.pushToRenderer("chat:onMessage", systemMsg);
  }

  private formatBurnDuration(seconds: number): string {
    if (seconds >= 604800) return `${Math.floor(seconds / 604800)}w`;
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
    return `${seconds}s`;
  }

  /**
   * Show a desktop notification for an incoming message.
   * Suppressed when the window is focused AND the user is viewing the relevant session,
   * or when the session is muted, or when global mute is enabled.
   */
  showNotification(title: string, body: string, sessionId: string): void {
    // Suppress if window is focused and user is viewing this conversation
    if (
      this.mainWindow &&
      !this.mainWindow.isDestroyed() &&
      this.mainWindow.isFocused() &&
      this.activeSessionId === sessionId
    ) {
      return;
    }

    // Check per-session mute
    const session = this.sessionRepo.findById(sessionId);
    if (session?.muted) return;

    // Check global mute
    try {
      const db = getDatabase();
      const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get("notifications_muted") as
        | { value: string | null }
        | undefined;
      if (row?.value) {
        try {
          if (JSON.parse(row.value) === true) return;
        } catch {
          // ignore parse errors
        }
      }
    } catch {
      // DB not available — allow notification
    }

    const notification = new Notification({ title, body });
    notification.on("click", () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore();
        this.mainWindow.focus();
        this.pushToRenderer("chat:onNavigateToSession", sessionId);
      }
    });
    notification.show();
  }

  async sendImageMessage(to: string, filePath: string): Promise<Message> {
    if (!this.imageService) throw new Error("Image service not configured");

    const now = Date.now();
    const myAddress = this.nknClient.getStatus().address;
    if (!myAddress) throw new Error("Not connected");

    const session = this.getOrCreateSession(to, myAddress);
    const messageId = crypto.randomUUID();

    // Check burn setting
    const contact = this.contactRepo.findByAddress(to);
    const burnAfterSeconds = contact?.burnAfterSeconds ?? 0;
    const deleteAt = burnAfterSeconds > 0 ? now + burnAfterSeconds * 1000 : undefined;

    // Insert placeholder message
    const message: Message = {
      id: messageId,
      sessionId: session.id,
      sender: myAddress,
      receiver: to,
      contentType: "ipfs",
      content: "",
      status: "sending",
      isOutbound: true,
      deleteAt,
      createdAt: now,
      updatedAt: now,
    };

    this.messageRepo.insert(message);
    if (deleteAt) this.messageRepo.updateDeleteAt(messageId, deleteAt);
    this.sessionRepo.updateLastMessage(session.id, "[Image]", now);
    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(session.id));

    // Step 1: Upload thumbnail + full image to IPFS (await completion)
    try {
      const { options, localFilePath, thumbnailLocalFilePath } =
        await this.imageService.processAndUpload(filePath);

      // Attach burn options
      if (burnAfterSeconds > 0) {
        options.deleteAfterSeconds = burnAfterSeconds;
        options.updateBurnAfterAt = contact?.burnUpdateAt;
      }

      // Update message with IPFS hash as content (nMobile convention)
      const ipfsHash = options.ipfsHash ?? "";
      this.messageRepo.updateContent(messageId, ipfsHash);
      this.messageRepo.updateOptions(messageId, JSON.stringify(options));
      this.messageRepo.updateLocalFilePath(messageId, localFilePath);
      this.messageRepo.updateThumbnailLocalFilePath(messageId, thumbnailLocalFilePath);

      message.content = ipfsHash;
      message.options = JSON.stringify(options);
      message.localFilePath = localFilePath;
      message.thumbnailLocalFilePath = thumbnailLocalFilePath;

      // Push updated message with local image before sending NKN notification
      this.pushToRenderer("chat:onMessage", { ...message });

      console.log(
        `[sendImageMessage] IPFS upload OK: ipfsHash=${ipfsHash}, thumbHash=${options.ipfsThumbnailHash}, sending NKN notification...`,
      );

      // Step 2: Send NKN notification (fire-and-forget, don't wait for ACK)
      const profileVersion = this.contactProfileService?.getMyProfileVersion();
      if (profileVersion) options.profileVersion = profileVersion;

      const messageData: MessageData = {
        id: messageId,
        contentType: "ipfs",
        content: ipfsHash,
        options,
        timestamp: now,
      };

      this.nknClient.sendMessageNoReply(to, JSON.stringify(messageData));
      this.messageRepo.updateStatus(messageId, "sent");
      message.status = "sent";
      this.pushToRenderer("chat:onMessage", { ...message, status: "sent" });
    } catch (err) {
      console.error("sendImageMessage failed:", err);
      this.messageRepo.updateStatus(messageId, "failed");
      message.status = "failed";
      this.pushToRenderer("chat:onMessage", { ...message, status: "failed" });
    }

    return message;
  }

  async sendAudioMessage(
    to: string,
    audioBuffer: Buffer,
    durationSeconds: number,
  ): Promise<Message> {
    if (!this.audioService) throw new Error("Audio service not configured");

    const now = Date.now();
    const myAddress = this.nknClient.getStatus().address;
    if (!myAddress) throw new Error("Not connected");

    const session = this.getOrCreateSession(to, myAddress);
    const messageId = crypto.randomUUID();

    // Check burn setting
    const contact = this.contactRepo.findByAddress(to);
    const burnAfterSeconds = contact?.burnAfterSeconds ?? 0;
    const deleteAt = burnAfterSeconds > 0 ? now + burnAfterSeconds * 1000 : undefined;

    // Insert placeholder message
    const message: Message = {
      id: messageId,
      sessionId: session.id,
      sender: myAddress,
      receiver: to,
      contentType: "audio",
      content: "",
      status: "sending",
      isOutbound: true,
      deleteAt,
      createdAt: now,
      updatedAt: now,
    };

    this.messageRepo.insert(message);
    if (deleteAt) this.messageRepo.updateDeleteAt(messageId, deleteAt);
    this.sessionRepo.updateLastMessage(session.id, "[Voice Message]", now);
    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(session.id));

    try {
      const result = await this.audioService.processAndUpload(audioBuffer, durationSeconds);

      // Update message in DB with actual content
      this.messageRepo.updateContent(messageId, result.content);
      this.messageRepo.updateOptions(messageId, JSON.stringify(result.options));
      this.messageRepo.updateLocalFilePath(messageId, result.localFilePath);

      message.content = result.content;
      message.options = JSON.stringify(result.options);
      message.localFilePath = result.localFilePath;

      // Push updated message with local file before sending NKN notification
      this.pushToRenderer("chat:onMessage", { ...message });

      // Build NKN message data and send inline with ACK
      const profileVersion = this.contactProfileService?.getMyProfileVersion();
      const audioOptions = { ...result.options };
      if (profileVersion) audioOptions.profileVersion = profileVersion;
      if (burnAfterSeconds > 0) {
        audioOptions.deleteAfterSeconds = burnAfterSeconds;
        audioOptions.updateBurnAfterAt = contact?.burnUpdateAt;
      }

      const messageData: MessageData = {
        id: messageId,
        contentType: "audio",
        content: result.content,
        options: audioOptions,
        timestamp: now,
      };

      this.nknClient.sendMessageNoReply(to, JSON.stringify(messageData));

      this.messageRepo.updateStatus(messageId, "sent");
      message.status = "sent";
      this.pushToRenderer("chat:onMessage", { ...message, status: "sent" });
    } catch (err) {
      console.error("sendAudioMessage failed:", err);
      this.messageRepo.updateStatus(messageId, "failed");
      message.status = "failed";
      this.pushToRenderer("chat:onMessage", { ...message, status: "failed" });
    }

    return message;
  }

  async sendFileMessage(to: string, filePath: string): Promise<Message> {
    if (!this.fileService) throw new Error("File service not configured");

    const now = Date.now();
    const myAddress = this.nknClient.getStatus().address;
    if (!myAddress) throw new Error("Not connected");

    const session = this.getOrCreateSession(to, myAddress);
    const messageId = crypto.randomUUID();

    // Check burn setting
    const contact = this.contactRepo.findByAddress(to);
    const burnAfterSeconds = contact?.burnAfterSeconds ?? 0;
    const deleteAt = burnAfterSeconds > 0 ? now + burnAfterSeconds * 1000 : undefined;

    const message: Message = {
      id: messageId,
      sessionId: session.id,
      sender: myAddress,
      receiver: to,
      contentType: "ipfs",
      content: "",
      status: "sending",
      isOutbound: true,
      deleteAt,
      createdAt: now,
      updatedAt: now,
    };

    this.messageRepo.insert(message);
    if (deleteAt) this.messageRepo.updateDeleteAt(messageId, deleteAt);
    this.sessionRepo.updateLastMessage(session.id, "[File]", now);
    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(session.id));

    try {
      const result = await this.fileService.processAndUpload(filePath);

      this.messageRepo.updateContent(messageId, result.content);
      this.messageRepo.updateOptions(messageId, JSON.stringify(result.options));
      this.messageRepo.updateLocalFilePath(messageId, result.localFilePath);

      message.content = result.content;
      message.options = JSON.stringify(result.options);
      message.localFilePath = result.localFilePath;

      this.pushToRenderer("chat:onMessage", { ...message });

      const profileVersion = this.contactProfileService?.getMyProfileVersion();
      const fileOptions = { ...result.options };
      if (profileVersion) fileOptions.profileVersion = profileVersion;
      if (burnAfterSeconds > 0) {
        fileOptions.deleteAfterSeconds = burnAfterSeconds;
        fileOptions.updateBurnAfterAt = contact?.burnUpdateAt;
      }

      const messageData: MessageData = {
        id: messageId,
        contentType: "ipfs",
        content: result.content,
        options: fileOptions,
        timestamp: now,
      };

      this.nknClient.sendMessageNoReply(to, JSON.stringify(messageData));
      this.messageRepo.updateStatus(messageId, "sent");
      message.status = "sent";
      this.pushToRenderer("chat:onMessage", { ...message, status: "sent" });
    } catch (err) {
      console.error("sendFileMessage failed:", err);
      this.messageRepo.updateStatus(messageId, "failed");
      message.status = "failed";
      this.pushToRenderer("chat:onMessage", { ...message, status: "failed" });
    }

    return message;
  }

  async sendMessage(params: SendMessageParams): Promise<Message> {
    const now = Date.now();
    const myAddress = this.nknClient.getStatus().address;
    if (!myAddress) throw new Error("Not connected");

    const session = this.getOrCreateSession(params.to, myAddress);

    // Check burn setting for this contact
    const contact = this.contactRepo.findByAddress(params.to);
    const burnAfterSeconds = contact?.burnAfterSeconds ?? 0;

    const profileVersion = this.contactProfileService?.getMyProfileVersion();
    const options: MessageOptions = {};
    if (profileVersion) options.profileVersion = profileVersion;

    let contentType = params.contentType ?? "text";

    if (burnAfterSeconds > 0) {
      // Use textExtension for burn text messages (nMobile convention)
      if (contentType === "text") contentType = "textExtension";
      options.deleteAfterSeconds = burnAfterSeconds;
      options.updateBurnAfterAt = contact?.burnUpdateAt;
    }

    const messageData: MessageData = {
      id: crypto.randomUUID(),
      contentType,
      content: params.content,
      options: Object.keys(options).length > 0 ? options : undefined,
      timestamp: now,
    };

    const deleteAt = burnAfterSeconds > 0 ? now + burnAfterSeconds * 1000 : undefined;

    const message: Message = {
      id: messageData.id,
      sessionId: session.id,
      sender: myAddress,
      receiver: params.to,
      contentType,
      content: params.content,
      status: "sending",
      isOutbound: true,
      deleteAt,
      createdAt: now,
      updatedAt: now,
    };

    this.messageRepo.insert(message);
    if (deleteAt) this.messageRepo.updateDeleteAt(message.id, deleteAt);
    this.sessionRepo.updateLastMessage(session.id, params.content, now);

    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(session.id));

    try {
      await this.nknClient.sendMessage(params.to, JSON.stringify(messageData));
      this.messageRepo.updateStatus(message.id, "sent");
      message.status = "sent";
      this.pushToRenderer("chat:onMessage", { ...message, status: "sent" });
    } catch {
      this.messageRepo.updateStatus(message.id, "failed");
      message.status = "failed";
      this.pushToRenderer("chat:onMessage", { ...message, status: "failed" });
    }

    return message;
  }

  private handleIncomingMessage(src: string, payload: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let raw: any;
    try {
      raw = JSON.parse(payload);
    } catch {
      // Try base64 decode (nMobile 2026 announcement format)
      try {
        const decoded = Buffer.from(payload, "base64").toString("utf-8");
        raw = JSON.parse(decoded);
      } catch {
        return; // truly malformed
      }
    }

    // Route nMobile 2026 announcement messages
    if (raw.type === "announcement" || raw.type === "periodic") {
      if (this.discoveryService) {
        this.discoveryService.handleAnnouncementMessage(src, raw as AnnouncementMessage);
      }
      return;
    }

    // nMobile sends content as object for private group control messages — normalize to JSON string
    if (raw.content && typeof raw.content === "object") {
      raw.content = JSON.stringify(raw.content);
    }

    const messageData = raw as MessageData;
    const contentType = messageData.contentType ?? "text";

    // Route private group control messages
    if (PRIVATE_GROUP_CONTROL_TYPES.has(contentType)) {
      if (this.privateGroupService) {
        console.log(`[ChatService] Routing ${contentType} from ${src.substring(0, 16)}... to PrivateGroupService`);
        this.privateGroupService.handleIncomingControlMessage(src, messageData);
      } else {
        console.warn(`[ChatService] Received ${contentType} but privateGroupService not set`);
      }
      return;
    }

    // Route private group messages (messages with a groupId field)
    if (messageData.groupId && this.privateGroupService) {
      if (DISPLAYABLE_TYPES.has(contentType)) {
        this.privateGroupService.handleIncomingGroupMessage(src, messageData);
      }
      return;
    }

    // Route discovery broadcasts
    if (contentType === "discovery:broadcast" && this.discoveryService) {
      this.discoveryService.handleIncomingBroadcast(src, raw as DiscoveryBroadcastMessage);
      return;
    }

    // Route topic control messages (subscribe/unsubscribe notifications)
    if (TOPIC_CONTROL_TYPES.has(contentType) && this.topicService) {
      this.topicService.handleIncomingTopicControl(src, messageData);
      return;
    }

    // Route topic messages (messages with a topic field)
    if (messageData.topic && this.topicService) {
      if (DISPLAYABLE_TYPES.has(contentType)) {
        this.topicService.handleIncomingTopicMessage(src, messageData);
      }
      return;
    }

    // Route contact profile exchange messages
    if (contentType === "contact" && this.contactProfileService) {
      this.contactProfileService.handleContactMessage(src, messageData);
      return;
    }

    // Handle contactOptions (burn-after-read settings from remote)
    if (contentType === "contactOptions") {
      this.handleContactOptions(src, raw);
      return;
    }

    // Handle delivery receipt — update original message to "delivered"
    if (contentType === "receipt" && raw.targetID) {
      const original = this.messageRepo.findById(raw.targetID);
      if (
        original &&
        original.isOutbound &&
        (original.status === "sending" || original.status === "sent")
      ) {
        this.messageRepo.updateStatus(original.id, "delivered");
        this.pushToRenderer("chat:onMessage", {
          ...original,
          status: "delivered",
        });
      }
      return;
    }

    // Handle read receipt — update original messages to "read"
    if (contentType === "read" && Array.isArray(raw.readIds)) {
      const ids = raw.readIds as string[];
      for (const id of ids) {
        const original = this.messageRepo.findById(id);
        if (
          original &&
          original.isOutbound &&
          original.status !== "read" &&
          original.status !== "failed"
        ) {
          this.messageRepo.updateStatus(original.id, "read");
          this.pushToRenderer("chat:onMessage", {
            ...original,
            status: "read",
          });
        }
      }
      return;
    }

    // Skip non-displayable message types (ping, device:*, etc.)
    if (!DISPLAYABLE_TYPES.has(contentType)) {
      return;
    }

    // Skip messages with no ID; allow empty content for IPFS messages
    if (!messageData.id) {
      return;
    }
    if (contentType !== "ipfs" && contentType !== "audio" && !messageData.content?.trim()) {
      return;
    }

    // dedup: check if we already have this message
    if (this.messageRepo.findById(messageData.id)) {
      return;
    }

    const myAddress = this.nknClient.getStatus().address;
    if (!myAddress) return;

    const session = this.getOrCreateSession(src, myAddress);

    const now = Date.now();
    const content = messageData.content ?? "";
    const optionsJson = messageData.options
      ? JSON.stringify(messageData.options)
      : undefined;

    const isIpfs = contentType === "ipfs";
    const isAudio = contentType === "audio";
    const fileType = messageData.options?.fileType;
    const isIpfsAudio = isIpfs && (fileType === 2 || fileType === "2");
    const isIpfsImage = isIpfs && (fileType === 1 || fileType === "1" || fileType === undefined);
    const isIpfsFile = isIpfs && !isIpfsAudio && !isIpfsImage;
    const sessionPreview = isAudio || isIpfsAudio
      ? "[Voice Message]"
      : isIpfsFile
        ? "[File]"
        : isIpfs
          ? "[Image]"
          : content;

    // Compute deleteAt for burn-after-read messages (1-to-1 only)
    const deleteAfterSeconds = messageData.options?.deleteAfterSeconds;
    const deleteAt = deleteAfterSeconds && deleteAfterSeconds > 0
      ? now + deleteAfterSeconds * 1000
      : undefined;

    // Sync burn setting from incoming message options
    if (deleteAfterSeconds !== undefined) {
      const incomingBurnAt = messageData.options?.updateBurnAfterAt ?? 0;
      const existingContact = this.contactRepo.findByAddress(src);
      if (existingContact && (existingContact.burnUpdateAt ?? 0) < incomingBurnAt) {
        this.contactRepo.updateBurnOptions(src, deleteAfterSeconds, incomingBurnAt);
        const updatedContact = this.contactRepo.findByAddress(src);
        if (updatedContact) this.pushToRenderer("contact:onUpdate", updatedContact);
      }
    }

    const message: Message = {
      id: messageData.id,
      sessionId: session.id,
      sender: src,
      receiver: myAddress,
      contentType: messageData.contentType ?? "text",
      content,
      status: "delivered",
      isOutbound: false,
      options: optionsJson,
      deleteAt,
      createdAt: messageData.timestamp ?? now,
      updatedAt: now,
    };

    this.messageRepo.insert(message);
    if (deleteAt) this.messageRepo.updateDeleteAt(message.id, deleteAt);
    this.sessionRepo.updateLastMessage(
      session.id,
      sessionPreview,
      messageData.timestamp ?? now,
    );
    this.sessionRepo.incrementUnread(session.id);

    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(session.id));

    // Desktop notification
    const contact = this.contactRepo.findByAddress(src);
    const displayName = contact?.name ?? src.substring(0, 8) + "...";
    const notifBody = isAudio || isIpfsAudio
      ? "Voice Message"
      : isIpfsFile
        ? "File"
        : isIpfs
          ? "Image"
          : content;
    this.showNotification(displayName, notifBody, session.id);

    // Check if sender's profile version changed (direct messages only)
    if (this.contactProfileService) {
      this.contactProfileService.checkAndRequestProfile(src, messageData);
    }

    // Send delivery receipt (fire-and-forget, direct 1-to-1 messages only)
    try {
      const receiptData: MessageData = {
        id: crypto.randomUUID(),
        contentType: "receipt",
        targetID: messageData.id,
        timestamp: Date.now(),
      };
      this.nknClient.sendMessageNoReply(src, JSON.stringify(receiptData));
    } catch (err) {
      console.error("Failed to send delivery receipt:", err);
    }

    // Handle inline audio (contentType "audio" with base64 content)
    if (isAudio && this.audioService && content) {
      const opts = messageData.options ?? {};
      const fileExt = (opts.fileExt as string) ?? "aac";
      const localFilePath = this.audioService.saveInlineAudio(
        messageData.id,
        content,
        fileExt,
      );
      this.messageRepo.updateLocalFilePath(messageData.id, localFilePath);
      this.pushToRenderer("chat:onMessage", { ...message, localFilePath });
    }

    // Background download for IPFS content
    // nMobile may send ipfsHash in options, or the IPFS CID as content
    const hasIpfsData =
      messageData.options?.ipfsHash ||
      (isIpfs && content && content.startsWith("Qm"));
    if (isIpfs && hasIpfsData) {
      const opts = messageData.options ?? {};
      if (!opts.ipfsHash && content) {
        opts.ipfsHash = content;
      }

      if (isIpfsAudio && this.audioService) {
        // IPFS audio download
        this.downloadIpfsAudio(message, opts);
      } else if (isIpfsFile && this.fileService) {
        // IPFS file download
        this.downloadIpfsFile(message, opts);
      } else if (this.imageService) {
        // IPFS image download (thumbnail first, then full)
        this.downloadIpfsThumbnailThenFull(message, opts);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleContactOptions(src: string, raw: any): void {
    try {
      let contentObj = raw.content;
      if (typeof contentObj === "string") {
        contentObj = JSON.parse(contentObj);
      }

      const optionType = contentObj?.optionType ?? raw.optionType;
      if (optionType !== "0" && optionType !== 0) return;

      const deleteAfterSeconds = contentObj?.deleteAfterSeconds ?? 0;
      const updateBurnAfterAt = contentObj?.updateBurnAfterAt ?? 0;

      // Last-write-wins: only apply if incoming is newer
      const existing = this.contactRepo.findByAddress(src);
      if (existing && (existing.burnUpdateAt ?? 0) >= updateBurnAfterAt) return;

      this.contactRepo.updateBurnOptions(src, deleteAfterSeconds, updateBurnAfterAt);
      const updated = this.contactRepo.findByAddress(src);
      if (updated) {
        this.pushToRenderer("contact:onUpdate", updated);
      }

      // Insert system message for UI display
      const myAddress = this.nknClient.getStatus().address;
      if (!myAddress) return;

      const session = this.getOrCreateSession(src, myAddress);
      const contact = this.contactRepo.findByAddress(src);
      const displayName = contact?.name ?? src.substring(0, 8) + "...";
      const burnLabel = deleteAfterSeconds > 0
        ? this.formatBurnDuration(deleteAfterSeconds)
        : "";
      const systemContent = deleteAfterSeconds > 0
        ? `${displayName} enabled burn after reading (${burnLabel})`
        : `${displayName} disabled burn after reading`;

      const systemMsg: Message = {
        id: crypto.randomUUID(),
        sessionId: session.id,
        sender: src,
        receiver: myAddress,
        contentType: "contactOptions",
        content: systemContent,
        status: "delivered",
        isOutbound: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.messageRepo.insert(systemMsg);
      this.pushToRenderer("chat:onMessage", systemMsg);
    } catch (err) {
      console.error("Failed to handle contactOptions:", err);
    }
  }

  private async downloadIpfsImage(
    message: Message,
    opts: MessageOptions,
    retries = 3,
  ): Promise<void> {
    // Get IPFS hash from options or from message content
    const ipfsHash = opts.ipfsHash || message.content;
    if (!this.imageService || !ipfsHash) return;

    // nMobile sends key as byte array; default to empty if missing
    const keyBytes = opts.ipfsEncryptKeyBytes ?? [];
    const nonceSize = opts.ipfsEncryptNonceSize ?? 12;
    const fileExt = opts.fileExt ?? "jpg";

    const preferredIp = opts.ipfsIp;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const localFilePath = await this.imageService.downloadAndDecrypt(
          ipfsHash,
          keyBytes,
          nonceSize,
          fileExt,
          preferredIp,
        );
        this.messageRepo.updateLocalFilePath(message.id, localFilePath);
        this.pushToRenderer("chat:onMessage", {
          ...message,
          localFilePath,
        });
        return;
      } catch (err) {
        console.error(
          `IPFS download attempt ${attempt}/${retries} failed for ${opts.ipfsHash}:`,
          err,
        );
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    // All retries exhausted — persist failure marker and push to renderer
    this.messageRepo.updateLocalFilePath(message.id, "__download_failed__");
    this.pushToRenderer("chat:onMessage", {
      ...message,
      localFilePath: "__download_failed__",
    });
  }

  private async downloadIpfsAudio(
    message: Message,
    opts: MessageOptions,
    retries = 3,
  ): Promise<void> {
    const ipfsHash = opts.ipfsHash || message.content;
    if (!this.audioService || !ipfsHash) return;

    const keyBytes = opts.ipfsEncryptKeyBytes ?? [];
    const nonceSize = opts.ipfsEncryptNonceSize ?? 12;
    const fileExt = (opts.fileExt as string) ?? "aac";
    const preferredIp = opts.ipfsIp;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const localFilePath = await this.audioService.downloadAndDecrypt(
          ipfsHash,
          keyBytes,
          nonceSize,
          fileExt,
          preferredIp,
        );
        this.messageRepo.updateLocalFilePath(message.id, localFilePath);
        this.pushToRenderer("chat:onMessage", { ...message, localFilePath });
        return;
      } catch (err) {
        console.error(
          `IPFS audio download attempt ${attempt}/${retries} failed for ${ipfsHash}:`,
          err,
        );
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    // All retries exhausted
    this.messageRepo.updateLocalFilePath(message.id, "__download_failed__");
    this.pushToRenderer("chat:onMessage", {
      ...message,
      localFilePath: "__download_failed__",
    });
  }

  /**
   * Download thumbnail first for quick preview, then full image in background.
   * Follows nMobile convention: thumbnail and full image are separate IPFS uploads.
   */
  private async downloadIpfsThumbnailThenFull(
    message: Message,
    opts: MessageOptions,
  ): Promise<void> {
    // Step 1: Download thumbnail if available (fast, small file)
    const thumbHash = opts.ipfsThumbnailHash;
    const thumbKeyBytes = opts.ipfsThumbnailEncryptKeyBytes;
    const thumbNonceSize = opts.ipfsThumbnailEncryptNonceSize ?? 12;
    const preferredIp = opts.ipfsThumbnailIp || opts.ipfsIp;

    if (thumbHash && thumbKeyBytes && thumbKeyBytes.length > 0 && this.imageService) {
      try {
        const thumbPath = await this.imageService.downloadAndDecrypt(
          thumbHash,
          thumbKeyBytes,
          thumbNonceSize,
          opts.fileExt ?? "jpg",
          preferredIp,
        );
        this.messageRepo.updateThumbnailLocalFilePath(message.id, thumbPath);
        this.pushToRenderer("chat:onMessage", {
          ...message,
          thumbnailLocalFilePath: thumbPath,
        });
        // Update message object for subsequent full-image push
        message.thumbnailLocalFilePath = thumbPath;
      } catch (err) {
        console.error(`Thumbnail download failed for ${thumbHash}:`, err);
        // Continue to full image download even if thumbnail fails
      }
    }

    // Step 2: Download full image in background
    await this.downloadIpfsImage(message, opts);
  }

  async retryAudioDownload(messageId: string): Promise<void> {
    const msg = this.messageRepo.findById(messageId);
    if (!msg) return;

    // Case 1: Inline audio (contentType "audio" with base64/data-URI content)
    if (msg.contentType === "audio" && msg.content && this.audioService) {
      const opts = msg.options ? JSON.parse(msg.options) : {};
      const fileExt = (opts.fileExt as string) ?? "aac";
      const localFilePath = this.audioService.saveInlineAudio(
        msg.id,
        msg.content,
        fileExt,
      );
      this.messageRepo.updateLocalFilePath(messageId, localFilePath);
      this.pushToRenderer("chat:onMessage", { ...msg, localFilePath });
      return;
    }

    // Case 2: IPFS audio (contentType "ipfs" with fileType 2, or "audio" with ipfsHash)
    if (!msg.options) return;
    let opts: MessageOptions;
    try {
      opts = JSON.parse(msg.options);
    } catch {
      return;
    }

    const isIpfsAudio =
      msg.contentType === "ipfs" &&
      (opts.fileType === 2 || opts.fileType === "2");
    const isAudioWithIpfs = msg.contentType === "audio" && opts.ipfsHash;
    if (!isIpfsAudio && !isAudioWithIpfs) return;
    if (!opts.ipfsHash) return;

    // Clear the failure marker
    this.messageRepo.updateLocalFilePath(messageId, "");
    const updatedMsg = this.messageRepo.findById(messageId);
    if (updatedMsg) {
      this.pushToRenderer("chat:onMessage", {
        ...updatedMsg,
        localFilePath: undefined,
      });
      await this.downloadIpfsAudio(updatedMsg, opts, 3);
    }
  }

  private async downloadIpfsFile(
    message: Message,
    opts: MessageOptions,
    retries = 3,
  ): Promise<void> {
    const ipfsHash = opts.ipfsHash || message.content;
    if (!this.fileService || !ipfsHash) return;

    const keyBytes = opts.ipfsEncryptKeyBytes ?? [];
    const nonceSize = opts.ipfsEncryptNonceSize ?? 12;
    const fileExt = (opts.fileExt as string) ?? "bin";
    const fileName = opts.fileName;
    const preferredIp = opts.ipfsIp;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const localFilePath = await this.fileService.downloadAndDecrypt(
          ipfsHash,
          keyBytes,
          nonceSize,
          fileExt,
          fileName,
          preferredIp,
        );
        this.messageRepo.updateLocalFilePath(message.id, localFilePath);
        this.pushToRenderer("chat:onMessage", { ...message, localFilePath });
        return;
      } catch (err) {
        console.error(
          `IPFS file download attempt ${attempt}/${retries} failed for ${ipfsHash}:`,
          err,
        );
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    this.messageRepo.updateLocalFilePath(message.id, "__download_failed__");
    this.pushToRenderer("chat:onMessage", {
      ...message,
      localFilePath: "__download_failed__",
    });
  }

  async retryFileDownload(messageId: string): Promise<void> {
    const msg = this.messageRepo.findById(messageId);
    if (!msg || msg.contentType !== "ipfs" || !msg.options) return;

    let opts: MessageOptions;
    try {
      opts = JSON.parse(msg.options);
    } catch {
      return;
    }

    const fileType = opts.fileType;
    const isFile = fileType === 0 || fileType === "0";
    if (!isFile || !opts.ipfsHash) return;

    this.messageRepo.updateLocalFilePath(messageId, "");
    const updatedMsg = this.messageRepo.findById(messageId);
    if (updatedMsg) {
      this.pushToRenderer("chat:onMessage", {
        ...updatedMsg,
        localFilePath: undefined,
      });
      await this.downloadIpfsFile(updatedMsg, opts, 3);
    }
  }

  async retryImageDownload(messageId: string): Promise<void> {
    const msg = this.messageRepo.findById(messageId);
    if (!msg || msg.contentType !== "ipfs" || !msg.options) return;

    let opts: MessageOptions;
    try {
      opts = JSON.parse(msg.options);
    } catch {
      return;
    }

    if (!opts.ipfsHash) return;

    // Clear the failure marker
    this.messageRepo.updateLocalFilePath(messageId, "");
    const updatedMsg = this.messageRepo.findById(messageId);
    if (updatedMsg) {
      // Push "downloading" state (localFilePath cleared)
      this.pushToRenderer("chat:onMessage", {
        ...updatedMsg,
        localFilePath: undefined,
      });
      await this.downloadIpfsImage(updatedMsg, opts, 3);
    }
  }

  startSession(targetAddress: string): { sessionId: string } {
    const myAddress = this.nknClient.getStatus().address;
    if (!myAddress) throw new Error("Not connected");
    const session = this.getOrCreateSession(targetAddress, myAddress);
    return { sessionId: session.id };
  }

  getMessages(sessionId: string, limit = 100, offset = 0): Message[] {
    return this.messageRepo.findBySessionId(sessionId, limit, offset);
  }

  markSessionRead(sessionId: string): void {
    this.sessionRepo.resetUnread(sessionId);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));

    // Send read receipts for direct 1-to-1 sessions only
    if (!sessionId.startsWith("direct:")) return;

    const targetAddress = sessionId.slice("direct:".length);
    const unreadInbound = this.messageRepo.findInboundBySessionIdAndStatus(
      sessionId,
      "read",
    );
    if (unreadInbound.length === 0) return;

    const readIds = unreadInbound.map((m) => m.id);
    this.messageRepo.updateStatusBatch(readIds, "read");

    try {
      const readData: MessageData = {
        id: crypto.randomUUID(),
        contentType: "read",
        readIds,
        timestamp: Date.now(),
      };
      this.nknClient.sendMessageNoReply(
        targetAddress,
        JSON.stringify(readData),
      );
    } catch (err) {
      console.error("Failed to send read receipt:", err);
    }
  }

  private getOrCreateSession(
    targetAddress: string,
    _myAddress: string,
  ): { id: string } {
    // Session ID based on target address only — one counterparty = one thread
    const sessionId = `direct:${targetAddress}`;

    let session = this.sessionRepo.findById(sessionId);
    if (!session) {
      // Also check for legacy sessions that included both addresses
      session = this.sessionRepo.findByTargetAddress(targetAddress);
      if (session && session.id !== sessionId) {
        // Migrate: delete old session, recreate with new ID scheme
        // Messages are kept since they reference sessionId, we'll update them
        this.messageRepo.updateSessionId(session.id, sessionId);
        this.sessionRepo.deleteById(session.id);
        session = undefined;
      }
    }

    if (!session) {
      const contact = this.contactRepo.findByAddress(targetAddress);
      const now = Date.now();
      session = {
        id: sessionId,
        type: "direct" as const,
        targetAddress,
        targetName: contact?.name ?? targetAddress.substring(0, 8) + "...",
        lastMessageContent: "",
        lastMessageAt: now,
        unreadCount: 0,
        muted: false,
        createdAt: now,
        updatedAt: now,
      };
      this.sessionRepo.upsert(session);
    }
    return session;
  }
}
