import crypto from "crypto";
import type { NknClientService } from "./nkn-client-service";
import type { MessageRepository } from "../db/repositories/message-repository";
import type { SessionRepository } from "../db/repositories/session-repository";
import type { ContactRepository } from "../db/repositories/contact-repository";
import type { Message, MessageData, SendMessageParams } from "../../shared/types";

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

  getMessages(sessionId: string, limit = 100, offset = 0): Message[] {
    return this.messageRepo.findBySessionId(sessionId, limit, offset);
  }

  markSessionRead(sessionId: string): void {
    this.sessionRepo.resetUnread(sessionId);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));
  }

  private getOrCreateSession(
    targetAddress: string,
    myAddress: string,
  ): { id: string } {
    // Use a deterministic session ID for 1-to-1 chats
    const addresses = [myAddress, targetAddress].sort();
    const sessionId = `direct:${addresses[0]}:${addresses[1]}`;

    let session = this.sessionRepo.findById(sessionId);
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
