import crypto from "crypto";
import type { NknClientService } from "./nkn-client-service";
import type { ImageService } from "./image-service";
import type { AudioService } from "./audio-service";
import type { FileService } from "./file-service";
import type { TopicService } from "./topic-service";
import type { MessageRepository } from "../db/repositories/message-repository";
import type { SessionRepository } from "../db/repositories/session-repository";
import type { ContactRepository } from "../db/repositories/contact-repository";
import type {
  Message,
  MessageData,
  MessageOptions,
  SendMessageParams,
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
  }

  /** Merge duplicate sessions that share the same target_address into one. */
  private consolidateLegacySessions(): void {
    try {
      const allSessions = this.sessionRepo.findAll();
      const byTarget = new Map<string, typeof allSessions>();

      for (const session of allSessions) {
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

  async sendImageMessage(to: string, filePath: string): Promise<Message> {
    if (!this.imageService) throw new Error("Image service not configured");

    const now = Date.now();
    const myAddress = this.nknClient.getStatus().address;
    if (!myAddress) throw new Error("Not connected");

    const session = this.getOrCreateSession(to, myAddress);
    const messageId = crypto.randomUUID();

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
      createdAt: now,
      updatedAt: now,
    };

    this.messageRepo.insert(message);
    this.sessionRepo.updateLastMessage(session.id, "[Image]", now);
    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(session.id));

    // Step 1: Upload thumbnail + full image to IPFS (await completion)
    try {
      const { options, localFilePath, thumbnailLocalFilePath } =
        await this.imageService.processAndUpload(filePath);

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
      createdAt: now,
      updatedAt: now,
    };

    this.messageRepo.insert(message);
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
      const messageData: MessageData = {
        id: messageId,
        contentType: "audio",
        content: result.content,
        options: result.options,
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

    const message: Message = {
      id: messageId,
      sessionId: session.id,
      sender: myAddress,
      receiver: to,
      contentType: "ipfs",
      content: "",
      status: "sending",
      isOutbound: true,
      createdAt: now,
      updatedAt: now,
    };

    this.messageRepo.insert(message);
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

      const messageData: MessageData = {
        id: messageId,
        contentType: "ipfs",
        content: result.content,
        options: result.options,
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

    const messageData: MessageData = {
      id: crypto.randomUUID(),
      contentType: params.contentType ?? "text",
      content: params.content,
      timestamp: now,
    };

    const message: Message = {
      id: messageData.id,
      sessionId: session.id,
      sender: myAddress,
      receiver: params.to,
      contentType: messageData.contentType,
      content: params.content,
      status: "sending",
      isOutbound: true,
      createdAt: now,
      updatedAt: now,
    };

    this.messageRepo.insert(message);
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
    let messageData: MessageData;
    try {
      messageData = JSON.parse(payload);
    } catch {
      return; // ignore malformed messages
    }

    const contentType = messageData.contentType ?? "text";

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

    // Skip non-displayable message types (ping, receipt, contact, device:*, read, etc.)
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

    // Auto-create contact if unknown
    if (!this.contactRepo.findByAddress(src)) {
      const now = Date.now();
      this.contactRepo.upsert({
        address: src,
        name: src.substring(0, 8) + "...",
        createdAt: now,
        updatedAt: now,
      });
    }

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
      createdAt: messageData.timestamp ?? now,
      updatedAt: now,
    };

    this.messageRepo.insert(message);
    this.sessionRepo.updateLastMessage(
      session.id,
      sessionPreview,
      messageData.timestamp ?? now,
    );
    this.sessionRepo.incrementUnread(session.id);

    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(session.id));

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
        createdAt: now,
        updatedAt: now,
      };
      this.sessionRepo.upsert(session);
    }
    return session;
  }
}
