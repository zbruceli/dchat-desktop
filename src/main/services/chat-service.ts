import crypto from "crypto";
import type { NknClientService } from "./nkn-client-service";
import type { MessageRepository } from "../db/repositories/message-repository";
import type { SessionRepository } from "../db/repositories/session-repository";
import type { ContactRepository } from "../db/repositories/contact-repository";
import type { Message, MessageData, SendMessageParams } from "../../shared/types";

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

export class ChatService {
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

    // Skip non-displayable message types (ping, receipt, contact, device:*, read, etc.)
    const contentType = messageData.contentType ?? "text";
    if (!DISPLAYABLE_TYPES.has(contentType)) {
      return;
    }

    // Skip messages with no ID or empty content
    if (!messageData.id || !messageData.content?.trim()) {
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
    const message: Message = {
      id: messageData.id,
      sessionId: session.id,
      sender: src,
      receiver: myAddress,
      contentType: messageData.contentType ?? "text",
      content,
      status: "delivered",
      isOutbound: false,
      createdAt: messageData.timestamp ?? now,
      updatedAt: now,
    };

    this.messageRepo.insert(message);
    this.sessionRepo.updateLastMessage(session.id, content, messageData.timestamp ?? now);
    this.sessionRepo.incrementUnread(session.id);

    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(session.id));
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
