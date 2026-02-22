import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { ChatService } from "../../../src/main/services/chat-service";
import { MessageRepository } from "../../../src/main/db/repositories/message-repository";
import { SessionRepository } from "../../../src/main/db/repositories/session-repository";
import { ContactRepository } from "../../../src/main/db/repositories/contact-repository";
import { runMigrations } from "../../../src/main/db/migrations/migration-runner";
import { MockNknClient } from "../../helpers/mock-nkn-client";
import {
  createMockImageService,
  createMockAudioService,
  createMockFileService,
  createMockTopicService,
  createMockPrivateGroupService,
  createMockContactProfileService,
} from "../../helpers/mock-services";
import { makeSession, makeMessage } from "../../helpers/db-helpers";
import type { MessageData } from "../../../src/shared/types";

// Mock electron Notification
vi.mock("electron", () => ({
  Notification: class MockNotification {
    constructor(_opts: Record<string, unknown>) {}
    on(_event: string, _cb: () => void) {}
    show() {}
  },
}));

// Mock getDatabase for showNotification global mute check
vi.mock("../../../src/main/db/database", () => ({
  getDatabase: () => {
    throw new Error("no db in test");
  },
}));

let db: Database.Database;
let messageRepo: MessageRepository;
let sessionRepo: SessionRepository;
let contactRepo: ContactRepository;
let nknClient: MockNknClient;
let pushToRenderer: ReturnType<typeof vi.fn>;
let chatService: ChatService;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);

  messageRepo = new MessageRepository(db);
  sessionRepo = new SessionRepository(db);
  contactRepo = new ContactRepository(db);
  nknClient = new MockNknClient();
  pushToRenderer = vi.fn();

  chatService = new ChatService(
    nknClient.asService(),
    messageRepo,
    sessionRepo,
    contactRepo,
    pushToRenderer,
  );
});

afterEach(() => {
  db.close();
});

describe("ChatService — sendMessage (text)", () => {
  it("sends a text message successfully (status transitions to sent)", async () => {
    const result = await chatService.sendMessage({
      to: "bob.addr",
      content: "Hello Bob",
    });
    expect(result.status).toBe("sent");
    expect(result.contentType).toBe("text");
    expect(result.content).toBe("Hello Bob");
    expect(result.isOutbound).toBe(true);
  });

  it("creates a session for new conversation", async () => {
    await chatService.sendMessage({ to: "bob.addr", content: "Hi" });
    const session = sessionRepo.findById("direct:bob.addr");
    expect(session).toBeDefined();
    expect(session!.targetAddress).toBe("bob.addr");
  });

  it("persists the message in the database", async () => {
    const result = await chatService.sendMessage({
      to: "bob.addr",
      content: "Test message",
    });
    const stored = messageRepo.findById(result.id);
    expect(stored).toBeDefined();
    expect(stored!.content).toBe("Test message");
    expect(stored!.status).toBe("sent");
  });

  it("pushes chat:onMessage and session:onUpdate events", async () => {
    await chatService.sendMessage({ to: "bob.addr", content: "Hi" });
    const chatPushes = pushToRenderer.mock.calls.filter(
      ([ch]: [string]) => ch === "chat:onMessage",
    );
    const sessionPushes = pushToRenderer.mock.calls.filter(
      ([ch]: [string]) => ch === "session:onUpdate",
    );
    expect(chatPushes.length).toBeGreaterThanOrEqual(2); // initial + sent
    expect(sessionPushes.length).toBeGreaterThanOrEqual(1);
  });

  it("marks message as failed when NKN send throws", async () => {
    nknClient.sendMessage.mockRejectedValueOnce(new Error("send failed"));
    const result = await chatService.sendMessage({
      to: "bob.addr",
      content: "Will fail",
    });
    expect(result.status).toBe("failed");
    const stored = messageRepo.findById(result.id);
    expect(stored!.status).toBe("failed");
  });

  it("throws when not connected", async () => {
    nknClient.setDisconnected();
    await expect(
      chatService.sendMessage({ to: "bob.addr", content: "Hi" }),
    ).rejects.toThrow("Not connected");
  });
});

describe("ChatService — sendAudioMessage", () => {
  it("throws when audioService is not set", async () => {
    await expect(
      chatService.sendAudioMessage("bob.addr", Buffer.from("audio"), 3.5),
    ).rejects.toThrow("Audio service not configured");
  });

  it("sends audio message successfully", async () => {
    const audioService = createMockAudioService();
    chatService.setAudioService(audioService);
    const result = await chatService.sendAudioMessage("bob.addr", Buffer.from("audio"), 3.5);
    expect(result.status).toBe("sent");
    expect(result.contentType).toBe("audio");
    expect(audioService.processAndUpload).toHaveBeenCalledWith(Buffer.from("audio"), 3.5);
  });

  it("marks message as failed on error", async () => {
    const audioService = createMockAudioService({
      processAndUpload: vi.fn().mockRejectedValue(new Error("conversion failed")),
    });
    chatService.setAudioService(audioService);
    const result = await chatService.sendAudioMessage("bob.addr", Buffer.from("audio"), 3.5);
    expect(result.status).toBe("failed");
  });
});

describe("ChatService — sendFileMessage", () => {
  it("throws when fileService is not set", async () => {
    await expect(chatService.sendFileMessage("bob.addr", "/path/to/file.pdf")).rejects.toThrow(
      "File service not configured",
    );
  });

  it("sends file message successfully with fileType=0", async () => {
    const fileService = createMockFileService();
    chatService.setFileService(fileService);
    const result = await chatService.sendFileMessage("bob.addr", "/path/to/file.pdf");
    expect(result.status).toBe("sent");
    expect(result.contentType).toBe("ipfs");
    expect(fileService.processAndUpload).toHaveBeenCalledWith("/path/to/file.pdf");

    // Verify NKN message wire format
    const [, payload] = nknClient.sendMessageNoReply.mock.calls[0];
    const data = JSON.parse(payload);
    expect(data.contentType).toBe("ipfs");
    expect(data.options.fileType).toBe(0);
  });

  it("marks message as failed on error", async () => {
    const fileService = createMockFileService({
      processAndUpload: vi.fn().mockRejectedValue(new Error("upload failed")),
    });
    chatService.setFileService(fileService);
    const result = await chatService.sendFileMessage("bob.addr", "/path/to/file.pdf");
    expect(result.status).toBe("failed");
  });
});

describe("ChatService — incoming message routing", () => {
  it("routes topic control messages to topicService", () => {
    const topicService = createMockTopicService();
    chatService.setTopicService(topicService);

    const msg: MessageData = {
      id: "m1",
      contentType: "topic:subscribe",
      topic: "general",
      timestamp: Date.now(),
    };
    nknClient.simulateMessage("sender.addr", JSON.stringify(msg));

    expect(topicService.handleIncomingTopicControl).toHaveBeenCalledWith("sender.addr", msg);
  });

  it("routes topic messages to topicService", () => {
    const topicService = createMockTopicService();
    chatService.setTopicService(topicService);

    const msg: MessageData = {
      id: "m1",
      contentType: "text",
      content: "Hello group",
      topic: "general",
      timestamp: Date.now(),
    };
    nknClient.simulateMessage("sender.addr", JSON.stringify(msg));

    expect(topicService.handleIncomingTopicMessage).toHaveBeenCalledWith("sender.addr", msg);
  });

  it("routes private group control messages to privateGroupService", () => {
    const pgService = createMockPrivateGroupService();
    chatService.setPrivateGroupService(pgService);

    const msg: MessageData = {
      id: "m1",
      contentType: "privateGroup:invitation",
      content: "{}",
      timestamp: Date.now(),
    };
    nknClient.simulateMessage("sender.addr", JSON.stringify(msg));

    expect(pgService.handleIncomingControlMessage).toHaveBeenCalled();
  });

  it("routes private group data messages to privateGroupService", () => {
    const pgService = createMockPrivateGroupService();
    chatService.setPrivateGroupService(pgService);

    const msg: MessageData = {
      id: "m1",
      contentType: "text",
      content: "Hi group",
      groupId: "group-123",
      timestamp: Date.now(),
    };
    nknClient.simulateMessage("sender.addr", JSON.stringify(msg));

    expect(pgService.handleIncomingGroupMessage).toHaveBeenCalledWith("sender.addr", msg);
  });

  it("routes contact profile messages to contactProfileService", () => {
    const cpService = createMockContactProfileService();
    chatService.setContactProfileService(cpService);

    const msg: MessageData = {
      id: "m1",
      contentType: "contact",
      content: "{}",
      timestamp: Date.now(),
    };
    nknClient.simulateMessage("sender.addr", JSON.stringify(msg));

    expect(cpService.handleContactMessage).toHaveBeenCalledWith("sender.addr", msg);
  });

  it("ignores malformed JSON", () => {
    nknClient.simulateMessage("sender.addr", "not valid json {{{");
    // Should not throw, no messages stored
    expect(pushToRenderer).not.toHaveBeenCalledWith("chat:onMessage", expect.anything());
  });

  it("ignores non-displayable content types (ping, device:*, etc.)", () => {
    const msg: MessageData = {
      id: "m1",
      contentType: "deviceInfo",
      content: "{}",
      timestamp: Date.now(),
    };
    nknClient.simulateMessage("sender.addr", JSON.stringify(msg));
    expect(messageRepo.findById("m1")).toBeUndefined();
  });

  it("deduplicates by message ID", () => {
    const msg: MessageData = {
      id: "dup-msg",
      contentType: "text",
      content: "Hello",
      timestamp: Date.now(),
    };
    nknClient.simulateMessage("sender.addr", JSON.stringify(msg));
    nknClient.simulateMessage("sender.addr", JSON.stringify(msg));
    const messages = messageRepo.findBySessionId("direct:sender.addr");
    expect(messages).toHaveLength(1);
  });
});

describe("ChatService — receipt handling", () => {
  it("updates delivery receipt to delivered", () => {
    // Create an outbound message
    const session = makeSession(db, "direct:bob.addr", { targetAddress: "bob.addr" });
    const msg = makeMessage({
      id: "out-msg-1",
      sessionId: session.id,
      sender: "my.nkn.address",
      receiver: "bob.addr",
      status: "sent",
      isOutbound: true,
    });
    messageRepo.insert(msg);

    // Simulate delivery receipt
    const receipt = {
      id: "receipt-1",
      contentType: "receipt",
      targetID: "out-msg-1",
      timestamp: Date.now(),
    };
    nknClient.simulateMessage("bob.addr", JSON.stringify(receipt));

    const updated = messageRepo.findById("out-msg-1");
    expect(updated!.status).toBe("delivered");
  });

  it("does not downgrade read to delivered", () => {
    const session = makeSession(db, "direct:bob.addr", { targetAddress: "bob.addr" });
    const msg = makeMessage({
      id: "out-msg-2",
      sessionId: session.id,
      sender: "my.nkn.address",
      receiver: "bob.addr",
      status: "read",
      isOutbound: true,
    });
    messageRepo.insert(msg);

    const receipt = {
      id: "receipt-2",
      contentType: "receipt",
      targetID: "out-msg-2",
      timestamp: Date.now(),
    };
    nknClient.simulateMessage("bob.addr", JSON.stringify(receipt));

    expect(messageRepo.findById("out-msg-2")!.status).toBe("read");
  });

  it("ignores receipt with missing targetID", () => {
    const receipt = {
      id: "receipt-3",
      contentType: "receipt",
      timestamp: Date.now(),
    };
    nknClient.simulateMessage("bob.addr", JSON.stringify(receipt));
    // Should not throw
  });

  it("handles read receipt updating batch of messages", () => {
    const session = makeSession(db, "direct:bob.addr", { targetAddress: "bob.addr" });
    const msg1 = makeMessage({
      id: "msg-r1",
      sessionId: session.id,
      sender: "my.nkn.address",
      receiver: "bob.addr",
      status: "delivered",
      isOutbound: true,
    });
    const msg2 = makeMessage({
      id: "msg-r2",
      sessionId: session.id,
      sender: "my.nkn.address",
      receiver: "bob.addr",
      status: "sent",
      isOutbound: true,
    });
    messageRepo.insert(msg1);
    messageRepo.insert(msg2);

    const readReceipt = {
      id: "read-receipt-1",
      contentType: "read",
      readIds: ["msg-r1", "msg-r2"],
      timestamp: Date.now(),
    };
    nknClient.simulateMessage("bob.addr", JSON.stringify(readReceipt));

    expect(messageRepo.findById("msg-r1")!.status).toBe("read");
    expect(messageRepo.findById("msg-r2")!.status).toBe("read");
  });

  it("ignores read receipt for already-read messages", () => {
    const session = makeSession(db, "direct:bob.addr", { targetAddress: "bob.addr" });
    const msg = makeMessage({
      id: "already-read",
      sessionId: session.id,
      sender: "my.nkn.address",
      receiver: "bob.addr",
      status: "read",
      isOutbound: true,
    });
    messageRepo.insert(msg);

    const readReceipt = {
      id: "read-receipt-2",
      contentType: "read",
      readIds: ["already-read"],
      timestamp: Date.now(),
    };
    nknClient.simulateMessage("bob.addr", JSON.stringify(readReceipt));

    expect(messageRepo.findById("already-read")!.status).toBe("read");
  });

  it("ignores read receipt for failed messages", () => {
    const session = makeSession(db, "direct:bob.addr", { targetAddress: "bob.addr" });
    const msg = makeMessage({
      id: "failed-msg",
      sessionId: session.id,
      sender: "my.nkn.address",
      receiver: "bob.addr",
      status: "failed",
      isOutbound: true,
    });
    messageRepo.insert(msg);

    const readReceipt = {
      id: "read-receipt-3",
      contentType: "read",
      readIds: ["failed-msg"],
      timestamp: Date.now(),
    };
    nknClient.simulateMessage("bob.addr", JSON.stringify(readReceipt));

    expect(messageRepo.findById("failed-msg")!.status).toBe("failed");
  });
});

describe("ChatService — markSessionRead", () => {
  it("resets unread count", () => {
    makeSession(db, "direct:bob.addr", { targetAddress: "bob.addr", unreadCount: 5 });
    chatService.markSessionRead("direct:bob.addr");
    expect(sessionRepo.findById("direct:bob.addr")!.unreadCount).toBe(0);
  });

  it("sends read receipt for direct sessions", () => {
    const session = makeSession(db, "direct:bob.addr", { targetAddress: "bob.addr" });
    // Insert inbound messages that aren't "read"
    messageRepo.insert(
      makeMessage({
        id: "inbound-1",
        sessionId: session.id,
        sender: "bob.addr",
        receiver: "my.nkn.address",
        status: "delivered",
        isOutbound: false,
      }),
    );

    chatService.markSessionRead("direct:bob.addr");

    expect(nknClient.sendMessageNoReply).toHaveBeenCalled();
    const [dest, payload] = nknClient.sendMessageNoReply.mock.calls[0];
    expect(dest).toBe("bob.addr");
    const data = JSON.parse(payload);
    expect(data.contentType).toBe("read");
    expect(data.readIds).toContain("inbound-1");
  });

  it("skips read receipt for topic sessions", () => {
    makeSession(db, "topic:general", {
      type: "topic",
      targetAddress: "general",
      targetName: "#general",
    });
    chatService.markSessionRead("topic:general");
    expect(nknClient.sendMessageNoReply).not.toHaveBeenCalled();
  });

  it("skips read receipt for private group sessions", () => {
    makeSession(db, "privateGroup:g1", {
      type: "privateGroup",
      targetAddress: "g1",
      targetName: "Group 1",
    });
    chatService.markSessionRead("privateGroup:g1");
    expect(nknClient.sendMessageNoReply).not.toHaveBeenCalled();
  });
});

describe("ChatService — session consolidation", () => {
  it("merges legacy sessions into canonical direct: format", () => {
    // Create a legacy session (non-canonical ID)
    makeSession(db, "legacy-session", {
      type: "direct",
      targetAddress: "bob.addr",
      targetName: "Bob",
    });
    // Insert a message in the legacy session
    messageRepo.insert(
      makeMessage({
        id: "legacy-msg",
        sessionId: "legacy-session",
        sender: "my.addr",
        receiver: "bob.addr",
      }),
    );

    // Creating a new ChatService should trigger consolidation
    const newChatService = new ChatService(
      nknClient.asService(),
      messageRepo,
      sessionRepo,
      contactRepo,
      pushToRenderer,
    );

    // Legacy session should be gone
    expect(sessionRepo.findById("legacy-session")).toBeUndefined();
    // Canonical session should exist
    expect(sessionRepo.findById("direct:bob.addr")).toBeDefined();
    // Messages should be migrated
    const messages = messageRepo.findBySessionId("direct:bob.addr");
    expect(messages.some((m) => m.id === "legacy-msg")).toBe(true);
  });

  it("skips topic and privateGroup sessions during consolidation", () => {
    makeSession(db, "topic:general", {
      type: "topic",
      targetAddress: "general",
      targetName: "#general",
    });
    makeSession(db, "privateGroup:g1", {
      type: "privateGroup",
      targetAddress: "g1",
      targetName: "Group 1",
    });

    // Creating a new ChatService should NOT touch these
    new ChatService(nknClient.asService(), messageRepo, sessionRepo, contactRepo, pushToRenderer);

    expect(sessionRepo.findById("topic:general")).toBeDefined();
    expect(sessionRepo.findById("privateGroup:g1")).toBeDefined();
  });
});

describe("ChatService — incoming message processing", () => {
  it("sends delivery receipt back to sender", () => {
    const msg: MessageData = {
      id: "incoming-1",
      contentType: "text",
      content: "Hello",
      timestamp: Date.now(),
    };
    nknClient.simulateMessage("sender.addr", JSON.stringify(msg));

    // Should have sent a receipt
    const receiptCalls = nknClient.sendMessageNoReply.mock.calls.filter(([, payload]: [string, string]) => {
      const data = JSON.parse(payload);
      return data.contentType === "receipt";
    });
    expect(receiptCalls).toHaveLength(1);
    const [dest, payload] = receiptCalls[0];
    expect(dest).toBe("sender.addr");
    const data = JSON.parse(payload);
    expect(data.targetID).toBe("incoming-1");
  });

  it("handles inline audio by saving to cache", () => {
    const audioService = createMockAudioService();
    chatService.setAudioService(audioService);

    const msg: MessageData = {
      id: "audio-msg-1",
      contentType: "audio",
      content: "![audio](data:audio/x-aac;base64,dGVzdA==)",
      options: { fileType: 2, fileExt: "aac", mediaDuration: 3.0 },
      timestamp: Date.now(),
    };
    nknClient.simulateMessage("sender.addr", JSON.stringify(msg));

    expect(audioService.saveInlineAudio).toHaveBeenCalledWith("audio-msg-1", msg.content, "aac");
  });

  it("increments unread count on incoming message", () => {
    const msg: MessageData = {
      id: "unread-1",
      contentType: "text",
      content: "Hi",
      timestamp: Date.now(),
    };
    nknClient.simulateMessage("sender.addr", JSON.stringify(msg));

    const session = sessionRepo.findById("direct:sender.addr");
    expect(session!.unreadCount).toBe(1);
  });

  it("sets correct session preview for different content types", () => {
    const audioService = createMockAudioService();
    chatService.setAudioService(audioService);

    // Audio message
    const audioMsg: MessageData = {
      id: "preview-audio",
      contentType: "audio",
      content: "![audio](data:audio/x-aac;base64,dGVzdA==)",
      options: { fileType: 2 },
      timestamp: Date.now(),
    };
    nknClient.simulateMessage("alice.addr", JSON.stringify(audioMsg));
    expect(sessionRepo.findById("direct:alice.addr")!.lastMessageContent).toBe("[Voice Message]");

    // Text message
    const textMsg: MessageData = {
      id: "preview-text",
      contentType: "text",
      content: "Hello world",
      timestamp: Date.now() + 1,
    };
    nknClient.simulateMessage("alice.addr", JSON.stringify(textMsg));
    expect(sessionRepo.findById("direct:alice.addr")!.lastMessageContent).toBe("Hello world");
  });
});

describe("ChatService — startSession and getMessages", () => {
  it("startSession creates a new session", () => {
    const result = chatService.startSession("bob.addr");
    expect(result.sessionId).toBe("direct:bob.addr");
    expect(sessionRepo.findById("direct:bob.addr")).toBeDefined();
  });

  it("startSession throws when not connected", () => {
    nknClient.setDisconnected();
    expect(() => chatService.startSession("bob.addr")).toThrow("Not connected");
  });

  it("getMessages returns messages for session", async () => {
    const session = makeSession(db, "direct:bob.addr", { targetAddress: "bob.addr" });
    messageRepo.insert(
      makeMessage({ id: "m1", sessionId: session.id, content: "First" }),
    );
    messageRepo.insert(
      makeMessage({ id: "m2", sessionId: session.id, content: "Second" }),
    );
    const messages = chatService.getMessages("direct:bob.addr");
    expect(messages).toHaveLength(2);
  });
});
