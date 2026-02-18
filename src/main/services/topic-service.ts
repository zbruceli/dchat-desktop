import crypto from "crypto";
import type { NknClientService } from "./nkn-client-service";
import type { TopicRepository } from "../db/repositories/topic-repository";
import type { TopicSubscriberRepository } from "../db/repositories/topic-subscriber-repository";
import type { MessageRepository } from "../db/repositories/message-repository";
import type { SessionRepository } from "../db/repositories/session-repository";
import type { ContactRepository } from "../db/repositories/contact-repository";
import type {
  Topic,
  TopicSubscriber,
  Message,
  MessageData,
  MessageContentType,
  MessageOptions,
} from "../../shared/types";
import type { ImageService } from "./image-service";
import type { AudioService } from "./audio-service";

const TOPIC_NAME_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Generate the NKN topic hash from a human-readable topic name.
 * nMobile convention: strip leading '#' chars, SHA-1 hash, hex-encode, prefix with "dchat".
 * e.g. "d-chat" → "dchat" + hex(sha1("d-chat"))
 */
function genTopicHash(topicName: string): string {
  const cleaned = topicName.replace(/^#+/, "");
  const hash = crypto.createHash("sha1").update(cleaned).digest("hex");
  return "dchat" + hash;
}

export class TopicService {
  private imageService: ImageService | null = null;
  private audioService: AudioService | null = null;

  constructor(
    private nknClient: NknClientService,
    private topicRepo: TopicRepository,
    private subscriberRepo: TopicSubscriberRepository,
    private messageRepo: MessageRepository,
    private sessionRepo: SessionRepository,
    private contactRepo: ContactRepository,
    private pushToRenderer: (channel: string, data: unknown) => void,
  ) {}

  setImageService(imageService: ImageService): void {
    this.imageService = imageService;
  }

  setAudioService(audioService: AudioService): void {
    this.audioService = audioService;
  }

  async createAndJoin(topicName: string): Promise<Topic> {
    if (!TOPIC_NAME_REGEX.test(topicName)) {
      throw new Error(
        "Invalid topic name. Use 1-64 alphanumeric characters, hyphens, or underscores.",
      );
    }

    const myAddress = this.nknClient.getAddress();
    if (!myAddress) throw new Error("Not connected");

    // Subscribe on blockchain using hashed topic name (nMobile convention)
    const topicHash = genTopicHash(topicName);
    console.log(`[TopicService] Subscribing to topic "${topicName}" (hash: ${topicHash})...`);
    const txnHash = await this.nknClient.subscribe(topicHash);
    console.log(`[TopicService] Subscribe txn: ${txnHash}`);

    const now = Date.now();
    const topic: Topic = {
      id: topicName,
      joined: true,
      subscribeAt: now,
      memberCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.topicRepo.upsert(topic);

    // Create topic session
    this.getOrCreateTopicSession(topicName);

    // Fetch and cache subscriber list
    await this.refreshSubscribers(topicName);

    // Broadcast subscribe notification to other subscribers
    const subscribers = this.getSubscriberAddresses(topicName);
    const dests = subscribers.filter((addr) => addr !== myAddress);
    if (dests.length > 0) {
      const controlMsg: MessageData = {
        id: crypto.randomUUID(),
        contentType: "topic:subscribe",
        topic: topicName,
        timestamp: now,
      };
      this.nknClient.sendToMultiple(dests, JSON.stringify(controlMsg));
    }

    const updated = this.topicRepo.findById(topicName)!;
    this.pushToRenderer("topic:onUpdate", updated);
    return updated;
  }

  async join(topicName: string): Promise<Topic> {
    return this.createAndJoin(topicName);
  }

  async leave(topicName: string): Promise<void> {
    const myAddress = this.nknClient.getAddress();
    if (!myAddress) throw new Error("Not connected");

    // Broadcast unsubscribe notification
    const subscribers = this.getSubscriberAddresses(topicName);
    const dests = subscribers.filter((addr) => addr !== myAddress);
    if (dests.length > 0) {
      const controlMsg: MessageData = {
        id: crypto.randomUUID(),
        contentType: "topic:unsubscribe",
        topic: topicName,
        timestamp: Date.now(),
      };
      this.nknClient.sendToMultiple(dests, JSON.stringify(controlMsg));
    }

    // Unsubscribe on blockchain using hashed topic name
    const topicHash = genTopicHash(topicName);
    console.log(`[TopicService] Unsubscribing from topic "${topicName}" (hash: ${topicHash})...`);
    try {
      const txnHash = await this.nknClient.unsubscribe(topicHash);
      console.log(`[TopicService] Unsubscribe txn: ${txnHash}`);
    } catch (err) {
      console.error(`[TopicService] Unsubscribe failed:`, err);
    }

    // Clean up DB: remove topic, subscribers, session, and messages
    const sessionId = `topic:${topicName}`;
    this.subscriberRepo.deleteByTopicId(topicName);
    this.messageRepo.deleteBySessionId(sessionId);
    this.sessionRepo.deleteById(sessionId);
    this.topicRepo.deleteById(topicName);

    console.log(`[TopicService] Cleaned up topic "${topicName}" from DB`);

    // Push a deleted marker so the renderer can remove the session
    this.pushToRenderer("session:onDelete", sessionId);
    this.pushToRenderer("topic:onDelete", topicName);
  }

  async refreshSubscribers(topicName: string): Promise<string[]> {
    const topicHash = genTopicHash(topicName);
    const addresses = await this.nknClient.getSubscribers(topicHash);

    // Replace all cached subscribers
    this.subscriberRepo.replaceAll(topicName, addresses);

    // Update member count
    this.topicRepo.setMemberCount(topicName, addresses.length);

    // Auto-create contacts for unknown subscribers
    const now = Date.now();
    for (const addr of addresses) {
      if (!this.contactRepo.findByAddress(addr)) {
        this.contactRepo.upsert({
          address: addr,
          name: addr.substring(0, 8) + "...",
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return addresses;
  }

  getSubscribers(topicName: string): TopicSubscriber[] {
    return this.subscriberRepo.findByTopicId(topicName);
  }

  private getSubscriberAddresses(topicName: string): string[] {
    return this.subscriberRepo
      .findByTopicId(topicName)
      .map((s) => s.contactAddress);
  }

  async sendTopicMessage(
    topicName: string,
    content: string,
    contentType: MessageContentType = "text",
  ): Promise<Message> {
    const myAddress = this.nknClient.getAddress();
    if (!myAddress) throw new Error("Not connected");

    const now = Date.now();
    const sessionId = `topic:${topicName}`;
    const messageId = crypto.randomUUID();

    // Build wire message with topic field
    const messageData: MessageData = {
      id: messageId,
      contentType,
      content,
      topic: topicName,
      timestamp: now,
    };

    const message: Message = {
      id: messageId,
      sessionId,
      sender: myAddress,
      receiver: topicName,
      contentType,
      content,
      status: "sending",
      isOutbound: true,
      createdAt: now,
      updatedAt: now,
    };

    // Ensure topic session exists before inserting message (FK constraint)
    this.getOrCreateTopicSession(topicName);

    this.messageRepo.insert(message);
    this.sessionRepo.updateLastMessage(sessionId, content, now);

    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));

    // Send to all subscribers except self
    const subscribers = this.getSubscriberAddresses(topicName);
    const dests = subscribers.filter((addr) => addr !== myAddress);

    if (dests.length > 0) {
      try {
        this.nknClient.sendToMultiple(dests, JSON.stringify(messageData));
        this.messageRepo.updateStatus(messageId, "sent");
        message.status = "sent";
        this.pushToRenderer("chat:onMessage", { ...message, status: "sent" });
      } catch (err) {
        console.error("[TopicService] sendTopicMessage failed:", err);
        this.messageRepo.updateStatus(messageId, "failed");
        message.status = "failed";
        this.pushToRenderer("chat:onMessage", { ...message, status: "failed" });
      }
    } else {
      // No subscribers — still mark as sent
      this.messageRepo.updateStatus(messageId, "sent");
      message.status = "sent";
      this.pushToRenderer("chat:onMessage", { ...message, status: "sent" });
    }

    return message;
  }

  async sendTopicImage(topicName: string, filePath: string): Promise<Message> {
    if (!this.imageService) throw new Error("Image service not configured");

    const myAddress = this.nknClient.getAddress();
    if (!myAddress) throw new Error("Not connected");

    const now = Date.now();
    const sessionId = `topic:${topicName}`;
    const messageId = crypto.randomUUID();

    // Insert placeholder message
    const message: Message = {
      id: messageId,
      sessionId,
      sender: myAddress,
      receiver: topicName,
      contentType: "ipfs",
      content: "",
      status: "sending",
      isOutbound: true,
      createdAt: now,
      updatedAt: now,
    };

    this.getOrCreateTopicSession(topicName);
    this.messageRepo.insert(message);
    this.sessionRepo.updateLastMessage(sessionId, "[Image]", now);
    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));

    try {
      const { options, localFilePath, thumbnailLocalFilePath } =
        await this.imageService.processAndUpload(filePath);

      const ipfsHash = options.ipfsHash ?? "";
      this.messageRepo.updateContent(messageId, ipfsHash);
      this.messageRepo.updateOptions(messageId, JSON.stringify(options));
      this.messageRepo.updateLocalFilePath(messageId, localFilePath);
      this.messageRepo.updateThumbnailLocalFilePath(messageId, thumbnailLocalFilePath);

      message.content = ipfsHash;
      message.options = JSON.stringify(options);
      message.localFilePath = localFilePath;
      message.thumbnailLocalFilePath = thumbnailLocalFilePath;

      this.pushToRenderer("chat:onMessage", { ...message });

      // Send to all subscribers except self
      const messageData: MessageData = {
        id: messageId,
        contentType: "ipfs",
        content: ipfsHash,
        options,
        topic: topicName,
        timestamp: now,
      };

      const subscribers = this.getSubscriberAddresses(topicName);
      const dests = subscribers.filter((addr) => addr !== myAddress);

      if (dests.length > 0) {
        this.nknClient.sendToMultiple(dests, JSON.stringify(messageData));
      }

      this.messageRepo.updateStatus(messageId, "sent");
      message.status = "sent";
      this.pushToRenderer("chat:onMessage", { ...message, status: "sent" });
    } catch (err) {
      console.error("[TopicService] sendTopicImage failed:", err);
      this.messageRepo.updateStatus(messageId, "failed");
      message.status = "failed";
      this.pushToRenderer("chat:onMessage", { ...message, status: "failed" });
    }

    return message;
  }

  async sendTopicAudio(
    topicName: string,
    audioBuffer: Buffer,
    durationSeconds: number,
  ): Promise<Message> {
    if (!this.audioService) throw new Error("Audio service not configured");

    const myAddress = this.nknClient.getAddress();
    if (!myAddress) throw new Error("Not connected");

    const now = Date.now();
    const sessionId = `topic:${topicName}`;
    const messageId = crypto.randomUUID();

    // Process WebM → AAC, get inline base64 content
    const result = await this.audioService.processAndUpload(audioBuffer, durationSeconds);

    const message: Message = {
      id: messageId,
      sessionId,
      sender: myAddress,
      receiver: topicName,
      contentType: "audio",
      content: result.content,
      status: "sending",
      isOutbound: true,
      options: JSON.stringify(result.options),
      localFilePath: result.localFilePath,
      createdAt: now,
      updatedAt: now,
    };

    this.getOrCreateTopicSession(topicName);
    this.messageRepo.insert(message);
    this.messageRepo.updateOptions(messageId, JSON.stringify(result.options));
    this.messageRepo.updateLocalFilePath(messageId, result.localFilePath);
    this.sessionRepo.updateLastMessage(sessionId, "[Audio]", now);

    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));

    // Build wire message with topic field
    const messageData: MessageData = {
      id: messageId,
      contentType: "audio",
      content: result.content,
      options: result.options,
      topic: topicName,
      timestamp: now,
    };

    const subscribers = this.getSubscriberAddresses(topicName);
    const dests = subscribers.filter((addr) => addr !== myAddress);

    if (dests.length > 0) {
      try {
        this.nknClient.sendToMultiple(dests, JSON.stringify(messageData));
        this.messageRepo.updateStatus(messageId, "sent");
        message.status = "sent";
        this.pushToRenderer("chat:onMessage", { ...message, status: "sent" });
      } catch (err) {
        console.error("[TopicService] sendTopicAudio failed:", err);
        this.messageRepo.updateStatus(messageId, "failed");
        message.status = "failed";
        this.pushToRenderer("chat:onMessage", { ...message, status: "failed" });
      }
    } else {
      this.messageRepo.updateStatus(messageId, "sent");
      message.status = "sent";
      this.pushToRenderer("chat:onMessage", { ...message, status: "sent" });
    }

    return message;
  }

  handleIncomingTopicControl(
    src: string,
    messageData: MessageData,
  ): void {
    const topicName = messageData.topic;
    if (!topicName) return;

    const topic = this.topicRepo.findById(topicName);
    if (!topic) return; // We don't know about this topic

    if (messageData.contentType === "topic:subscribe") {
      // Add subscriber
      this.subscriberRepo.upsert(topicName, src);
      const count = this.subscriberRepo.findByTopicId(topicName).length;
      this.topicRepo.setMemberCount(topicName, count);

      // Auto-create contact
      if (!this.contactRepo.findByAddress(src)) {
        const now = Date.now();
        this.contactRepo.upsert({
          address: src,
          name: src.substring(0, 8) + "...",
          createdAt: now,
          updatedAt: now,
        });
      }

      console.log(`[TopicService] ${src} joined topic "${topicName}" (${count} members)`);
    } else if (messageData.contentType === "topic:unsubscribe") {
      // Remove subscriber
      this.subscriberRepo.deleteByTopicAndAddress(topicName, src);
      const count = this.subscriberRepo.findByTopicId(topicName).length;
      this.topicRepo.setMemberCount(topicName, count);

      console.log(`[TopicService] ${src} left topic "${topicName}" (${count} members)`);
    }

    // Push updated topic to renderer
    const updated = this.topicRepo.findById(topicName);
    if (updated) {
      this.pushToRenderer("topic:onUpdate", updated);
    }
  }

  handleIncomingTopicMessage(
    src: string,
    messageData: MessageData,
  ): void {
    const topicName = messageData.topic;
    if (!topicName) return;

    const myAddress = this.nknClient.getAddress();
    if (!myAddress) return;

    // Dedup
    if (this.messageRepo.findById(messageData.id)) return;

    const sessionId = `topic:${topicName}`;

    // Ensure topic session exists
    this.getOrCreateTopicSession(topicName);

    // Auto-create contact for sender
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

    // Sender name for session preview
    const contact = this.contactRepo.findByAddress(src);
    const senderName = contact?.name ?? src.substring(0, 8) + "...";
    const isIpfs = messageData.contentType === "ipfs";
    const isAudio = messageData.contentType === "audio";
    const sessionPreview = isIpfs
      ? `${senderName}: [Image]`
      : isAudio
        ? `${senderName}: [Audio]`
        : `${senderName}: ${content}`;

    const message: Message = {
      id: messageData.id,
      sessionId,
      sender: src,
      receiver: topicName,
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
      sessionId,
      sessionPreview,
      messageData.timestamp ?? now,
    );
    this.sessionRepo.incrementUnread(sessionId);

    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));

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

    // Background download for IPFS content (mirrors ChatService pattern)
    const hasIpfsData =
      messageData.options?.ipfsHash ||
      (isIpfs && content && content.startsWith("Qm"));

    if (isIpfs && hasIpfsData) {
      const opts = messageData.options ?? {};
      if (!opts.ipfsHash && content) {
        opts.ipfsHash = content;
      }

      const fileType = opts.fileType;
      const isImage = fileType === 1 || fileType === "1" || fileType === undefined;
      const isIpfsAudio = fileType === 2 || fileType === "2";

      if (isImage && this.imageService) {
        this.downloadTopicIpfsThumbnailThenFull(message, opts).catch((err) => {
          console.error("[TopicService] IPFS image download error:", err);
          this.messageRepo.updateLocalFilePath(message.id, "__download_failed__");
          this.pushToRenderer("chat:onMessage", {
            ...message,
            localFilePath: "__download_failed__",
          });
        });
      } else if (isIpfsAudio && this.audioService) {
        this.downloadTopicIpfsAudio(message, opts).catch((err) => {
          console.error("[TopicService] IPFS audio download error:", err);
          this.messageRepo.updateLocalFilePath(message.id, "__download_failed__");
          this.pushToRenderer("chat:onMessage", {
            ...message,
            localFilePath: "__download_failed__",
          });
        });
      }
    }
  }

  listTopics(): Topic[] {
    return this.topicRepo.findAll();
  }

  getTopic(topicName: string): Topic | undefined {
    return this.topicRepo.findById(topicName);
  }

  private async downloadTopicIpfsImage(
    message: Message,
    opts: MessageOptions,
    retries = 3,
  ): Promise<void> {
    const ipfsHash = opts.ipfsHash || message.content;
    if (!this.imageService || !ipfsHash) return;

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
        this.pushToRenderer("chat:onMessage", { ...message, localFilePath });
        return;
      } catch (err) {
        console.error(
          `[TopicService] IPFS download attempt ${attempt}/${retries} failed for ${ipfsHash}:`,
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

  private async downloadTopicIpfsThumbnailThenFull(
    message: Message,
    opts: MessageOptions,
  ): Promise<void> {
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
        message.thumbnailLocalFilePath = thumbPath;
      } catch (err) {
        console.error(`[TopicService] Thumbnail download failed for ${thumbHash}:`, err);
      }
    }

    await this.downloadTopicIpfsImage(message, opts);
  }

  private async downloadTopicIpfsAudio(
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
          `[TopicService] IPFS audio download attempt ${attempt}/${retries} failed for ${ipfsHash}:`,
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

  private getOrCreateTopicSession(topicName: string): void {
    const sessionId = `topic:${topicName}`;
    const existing = this.sessionRepo.findById(sessionId);
    if (existing) return;

    const now = Date.now();
    this.sessionRepo.upsert({
      id: sessionId,
      type: "topic",
      targetAddress: topicName,
      targetName: `#${topicName}`,
      lastMessageContent: "",
      lastMessageAt: now,
      unreadCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
}
