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
} from "../../shared/types";

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
  constructor(
    private nknClient: NknClientService,
    private topicRepo: TopicRepository,
    private subscriberRepo: TopicSubscriberRepository,
    private messageRepo: MessageRepository,
    private sessionRepo: SessionRepository,
    private contactRepo: ContactRepository,
    private pushToRenderer: (channel: string, data: unknown) => void,
  ) {}

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
    const sessionPreview = `${senderName}: ${content}`;

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
  }

  listTopics(): Topic[] {
    return this.topicRepo.findAll();
  }

  getTopic(topicName: string): Topic | undefined {
    return this.topicRepo.findById(topicName);
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
