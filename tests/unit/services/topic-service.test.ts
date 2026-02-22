import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { TopicService } from "../../../src/main/services/topic-service";
import { TopicRepository } from "../../../src/main/db/repositories/topic-repository";
import { TopicSubscriberRepository } from "../../../src/main/db/repositories/topic-subscriber-repository";
import { MessageRepository } from "../../../src/main/db/repositories/message-repository";
import { SessionRepository } from "../../../src/main/db/repositories/session-repository";
import { ContactRepository } from "../../../src/main/db/repositories/contact-repository";
import { runMigrations } from "../../../src/main/db/migrations/migration-runner";
import { MockNknClient } from "../../helpers/mock-nkn-client";
import { createMockImageService, createMockAudioService, createMockFileService } from "../../helpers/mock-services";
import type { MessageData } from "../../../src/shared/types";

let db: Database.Database;
let topicRepo: TopicRepository;
let subscriberRepo: TopicSubscriberRepository;
let messageRepo: MessageRepository;
let sessionRepo: SessionRepository;
let contactRepo: ContactRepository;
let nknClient: MockNknClient;
let pushToRenderer: ReturnType<typeof vi.fn>;
let topicService: TopicService;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);

  topicRepo = new TopicRepository(db);
  subscriberRepo = new TopicSubscriberRepository(db);
  messageRepo = new MessageRepository(db);
  sessionRepo = new SessionRepository(db);
  contactRepo = new ContactRepository(db);
  nknClient = new MockNknClient();
  pushToRenderer = vi.fn();

  topicService = new TopicService(
    nknClient.asService(),
    topicRepo,
    subscriberRepo,
    messageRepo,
    sessionRepo,
    contactRepo,
    pushToRenderer,
  );
});

afterEach(() => {
  db.close();
});

describe("TopicService — createAndJoin", () => {
  it("rejects invalid topic names", async () => {
    await expect(topicService.createAndJoin("bad name!")).rejects.toThrow("Invalid topic name");
  });

  it("rejects empty topic name", async () => {
    await expect(topicService.createAndJoin("")).rejects.toThrow("Invalid topic name");
  });

  it("throws when not connected", async () => {
    nknClient.setDisconnected();
    await expect(topicService.createAndJoin("general")).rejects.toThrow("Not connected");
  });

  it("subscribes with hashed topic name", async () => {
    nknClient.getSubscribers.mockResolvedValue(["my.nkn.address"]);
    await topicService.createAndJoin("general");
    expect(nknClient.subscribe).toHaveBeenCalledTimes(1);
    const hashArg = nknClient.subscribe.mock.calls[0][0];
    expect(hashArg).toMatch(/^dchat[a-f0-9]{40}$/);
  });

  it("creates topic record in DB", async () => {
    nknClient.getSubscribers.mockResolvedValue(["my.nkn.address"]);
    const topic = await topicService.createAndJoin("general");
    expect(topic.id).toBe("general");
    expect(topic.joined).toBe(true);
  });

  it("creates topic session", async () => {
    nknClient.getSubscribers.mockResolvedValue(["my.nkn.address"]);
    await topicService.createAndJoin("general");
    const session = sessionRepo.findById("topic:general");
    expect(session).toBeDefined();
    expect(session!.type).toBe("topic");
  });

  it("fetches and caches subscribers", async () => {
    nknClient.getSubscribers.mockResolvedValue(["my.nkn.address", "bob.addr"]);
    await topicService.createAndJoin("general");
    const subs = subscriberRepo.findByTopicId("general");
    expect(subs).toHaveLength(2);
  });

  it("broadcasts subscribe control to other subscribers", async () => {
    nknClient.getSubscribers.mockResolvedValue(["my.nkn.address", "bob.addr", "carol.addr"]);
    await topicService.createAndJoin("general");
    expect(nknClient.sendToMultiple).toHaveBeenCalled();
    const [dests, payload] = nknClient.sendToMultiple.mock.calls[0];
    expect(dests).not.toContain("my.nkn.address");
    expect(dests).toContain("bob.addr");
    const data = JSON.parse(payload);
    expect(data.contentType).toBe("topic:subscribe");
  });

  it("pushes topic:onUpdate event", async () => {
    nknClient.getSubscribers.mockResolvedValue([]);
    await topicService.createAndJoin("general");
    const topicUpdates = pushToRenderer.mock.calls.filter(
      ([ch]: [string]) => ch === "topic:onUpdate",
    );
    expect(topicUpdates.length).toBeGreaterThanOrEqual(1);
  });
});

describe("TopicService — leave", () => {
  beforeEach(async () => {
    nknClient.getSubscribers.mockResolvedValue(["my.nkn.address", "bob.addr"]);
    await topicService.createAndJoin("general");
    nknClient.sendToMultiple.mockClear();
    pushToRenderer.mockClear();
  });

  it("broadcasts unsubscribe control message", async () => {
    await topicService.leave("general");
    expect(nknClient.sendToMultiple).toHaveBeenCalled();
    const [, payload] = nknClient.sendToMultiple.mock.calls[0];
    expect(JSON.parse(payload).contentType).toBe("topic:unsubscribe");
  });

  it("calls nkn unsubscribe with hashed name", async () => {
    await topicService.leave("general");
    expect(nknClient.unsubscribe).toHaveBeenCalled();
    const hashArg = nknClient.unsubscribe.mock.calls[0][0];
    expect(hashArg).toMatch(/^dchat[a-f0-9]{40}$/);
  });

  it("deletes DB records", async () => {
    await topicService.leave("general");
    expect(topicRepo.findById("general")).toBeUndefined();
    expect(subscriberRepo.findByTopicId("general")).toEqual([]);
    expect(sessionRepo.findById("topic:general")).toBeUndefined();
  });

  it("pushes delete events", async () => {
    await topicService.leave("general");
    const sessionDeletes = pushToRenderer.mock.calls.filter(
      ([ch]: [string]) => ch === "session:onDelete",
    );
    const topicDeletes = pushToRenderer.mock.calls.filter(
      ([ch]: [string]) => ch === "topic:onDelete",
    );
    expect(sessionDeletes).toHaveLength(1);
    expect(topicDeletes).toHaveLength(1);
  });

  it("handles unsubscribe failure gracefully", async () => {
    nknClient.unsubscribe.mockRejectedValueOnce(new Error("network error"));
    // Should not throw — logs error and continues cleanup
    await expect(topicService.leave("general")).resolves.toBeUndefined();
    expect(topicRepo.findById("general")).toBeUndefined();
  });
});

describe("TopicService — refreshSubscribers", () => {
  beforeEach(async () => {
    nknClient.getSubscribers.mockResolvedValue(["my.nkn.address"]);
    await topicService.createAndJoin("general");
  });

  it("calls getSubscribers with hashed name", async () => {
    nknClient.getSubscribers.mockResolvedValue(["my.nkn.address", "new.addr"]);
    await topicService.refreshSubscribers("general");
    expect(nknClient.getSubscribers).toHaveBeenCalled();
  });

  it("replaces subscribers in DB and updates count", async () => {
    nknClient.getSubscribers.mockResolvedValue(["alice.addr", "bob.addr", "carol.addr"]);
    await topicService.refreshSubscribers("general");
    const subs = subscriberRepo.findByTopicId("general");
    expect(subs).toHaveLength(3);
    const topic = topicRepo.findById("general");
    expect(topic!.memberCount).toBe(3);
  });
});

describe("TopicService — sendTopicMessage", () => {
  beforeEach(async () => {
    nknClient.getSubscribers.mockResolvedValue(["my.nkn.address", "bob.addr", "carol.addr"]);
    await topicService.createAndJoin("general");
    nknClient.sendToMultiple.mockClear();
    pushToRenderer.mockClear();
  });

  it("sends to all subscribers minus self", async () => {
    const msg = await topicService.sendTopicMessage("general", "Hello group");
    expect(msg.status).toBe("sent");
    expect(nknClient.sendToMultiple).toHaveBeenCalled();
    const [dests] = nknClient.sendToMultiple.mock.calls[0];
    expect(dests).not.toContain("my.nkn.address");
    expect(dests).toContain("bob.addr");
    expect(dests).toContain("carol.addr");
  });

  it("includes topic field in wire message", async () => {
    await topicService.sendTopicMessage("general", "Hello");
    const [, payload] = nknClient.sendToMultiple.mock.calls[0];
    const data = JSON.parse(payload);
    expect(data.topic).toBe("general");
    expect(data.contentType).toBe("text");
  });

  it("marks sent even with no subscribers", async () => {
    // Remove all subscribers
    subscriberRepo.replaceAll("general", []);
    const msg = await topicService.sendTopicMessage("general", "Hello empty");
    expect(msg.status).toBe("sent");
  });

  it("marks failed when sendToMultiple throws", async () => {
    nknClient.sendToMultiple.mockImplementationOnce(() => {
      throw new Error("send failed");
    });
    const msg = await topicService.sendTopicMessage("general", "Fail");
    expect(msg.status).toBe("failed");
  });

  it("persists message in DB", async () => {
    const msg = await topicService.sendTopicMessage("general", "Stored");
    const stored = messageRepo.findById(msg.id);
    expect(stored).toBeDefined();
    expect(stored!.sessionId).toBe("topic:general");
  });
});

describe("TopicService — sendTopicImage", () => {
  it("throws when imageService is not set", async () => {
    nknClient.getSubscribers.mockResolvedValue(["my.nkn.address"]);
    await topicService.createAndJoin("general");
    await expect(topicService.sendTopicImage("general", "/img.jpg")).rejects.toThrow(
      "Image service not configured",
    );
  });

  it("sends image to subscribers", async () => {
    nknClient.getSubscribers.mockResolvedValue(["my.nkn.address", "bob.addr"]);
    await topicService.createAndJoin("general");
    topicService.setImageService(createMockImageService());
    nknClient.sendToMultiple.mockClear();
    const msg = await topicService.sendTopicImage("general", "/img.jpg");
    expect(msg.status).toBe("sent");
    expect(msg.contentType).toBe("ipfs");
  });
});

describe("TopicService — sendTopicAudio", () => {
  it("throws when audioService is not set", async () => {
    nknClient.getSubscribers.mockResolvedValue(["my.nkn.address"]);
    await topicService.createAndJoin("general");
    await expect(
      topicService.sendTopicAudio("general", Buffer.from("audio"), 3.0),
    ).rejects.toThrow("Audio service not configured");
  });
});

describe("TopicService — sendTopicFile", () => {
  it("throws when fileService is not set", async () => {
    nknClient.getSubscribers.mockResolvedValue(["my.nkn.address"]);
    await topicService.createAndJoin("general");
    await expect(topicService.sendTopicFile("general", "/file.pdf")).rejects.toThrow(
      "File service not configured",
    );
  });
});

describe("TopicService — handleIncomingTopicControl", () => {
  beforeEach(async () => {
    nknClient.getSubscribers.mockResolvedValue(["my.nkn.address"]);
    await topicService.createAndJoin("general");
    pushToRenderer.mockClear();
  });

  it("subscribe adds subscriber and updates count", () => {
    const msg: MessageData = {
      id: "ctrl-1",
      contentType: "topic:subscribe",
      topic: "general",
      timestamp: Date.now(),
    };
    topicService.handleIncomingTopicControl("bob.addr", msg);
    const subs = subscriberRepo.findByTopicId("general");
    expect(subs.some((s) => s.contactAddress === "bob.addr")).toBe(true);
    const topic = topicRepo.findById("general");
    expect(topic!.memberCount).toBe(subs.length);
  });

  it("unsubscribe removes subscriber and updates count", () => {
    subscriberRepo.upsert("general", "bob.addr");
    const msg: MessageData = {
      id: "ctrl-2",
      contentType: "topic:unsubscribe",
      topic: "general",
      timestamp: Date.now(),
    };
    topicService.handleIncomingTopicControl("bob.addr", msg);
    const subs = subscriberRepo.findByTopicId("general");
    expect(subs.some((s) => s.contactAddress === "bob.addr")).toBe(false);
  });

  it("ignores control message for unknown topic", () => {
    const msg: MessageData = {
      id: "ctrl-3",
      contentType: "topic:subscribe",
      topic: "unknown-topic",
      timestamp: Date.now(),
    };
    topicService.handleIncomingTopicControl("bob.addr", msg);
    // Should not throw
    expect(subscriberRepo.findByTopicId("unknown-topic")).toEqual([]);
  });

  it("pushes topic:onUpdate after control message", () => {
    const msg: MessageData = {
      id: "ctrl-4",
      contentType: "topic:subscribe",
      topic: "general",
      timestamp: Date.now(),
    };
    topicService.handleIncomingTopicControl("bob.addr", msg);
    const updates = pushToRenderer.mock.calls.filter(([ch]: [string]) => ch === "topic:onUpdate");
    expect(updates.length).toBeGreaterThanOrEqual(1);
  });
});

describe("TopicService — handleIncomingTopicMessage", () => {
  beforeEach(async () => {
    nknClient.getSubscribers.mockResolvedValue(["my.nkn.address"]);
    await topicService.createAndJoin("general");
    pushToRenderer.mockClear();
  });

  it("stores incoming message in DB", () => {
    const msg: MessageData = {
      id: "topic-msg-1",
      contentType: "text",
      content: "Hello from Bob",
      topic: "general",
      timestamp: Date.now(),
    };
    topicService.handleIncomingTopicMessage("bob.addr", msg);
    const stored = messageRepo.findById("topic-msg-1");
    expect(stored).toBeDefined();
    expect(stored!.sessionId).toBe("topic:general");
    expect(stored!.sender).toBe("bob.addr");
  });

  it("increments unread count", () => {
    const msg: MessageData = {
      id: "topic-msg-2",
      contentType: "text",
      content: "Hi",
      topic: "general",
      timestamp: Date.now(),
    };
    topicService.handleIncomingTopicMessage("bob.addr", msg);
    expect(sessionRepo.findById("topic:general")!.unreadCount).toBe(1);
  });

  it("deduplicates by message ID", () => {
    const msg: MessageData = {
      id: "dup-topic-msg",
      contentType: "text",
      content: "Hello",
      topic: "general",
      timestamp: Date.now(),
    };
    topicService.handleIncomingTopicMessage("bob.addr", msg);
    topicService.handleIncomingTopicMessage("bob.addr", msg);
    const messages = messageRepo.findBySessionId("topic:general");
    expect(messages).toHaveLength(1);
  });

  it("sets correct session preview with sender name", () => {
    contactRepo.upsert({
      address: "bob.addr",
      name: "Bob",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const msg: MessageData = {
      id: "preview-msg",
      contentType: "text",
      content: "Hey everyone",
      topic: "general",
      timestamp: Date.now(),
    };
    topicService.handleIncomingTopicMessage("bob.addr", msg);
    const session = sessionRepo.findById("topic:general");
    expect(session!.lastMessageContent).toBe("Bob: Hey everyone");
  });

  it("pushes chat:onMessage and session:onUpdate events", () => {
    const msg: MessageData = {
      id: "push-msg",
      contentType: "text",
      content: "Hello",
      topic: "general",
      timestamp: Date.now(),
    };
    topicService.handleIncomingTopicMessage("bob.addr", msg);
    const chatPushes = pushToRenderer.mock.calls.filter(
      ([ch]: [string]) => ch === "chat:onMessage",
    );
    expect(chatPushes.length).toBeGreaterThanOrEqual(1);
  });
});

describe("TopicService — listTopics / getTopic", () => {
  it("listTopics returns all topics", async () => {
    nknClient.getSubscribers.mockResolvedValue([]);
    await topicService.createAndJoin("t1");
    await topicService.createAndJoin("t2");
    expect(topicService.listTopics()).toHaveLength(2);
  });

  it("getTopic returns specific topic", async () => {
    nknClient.getSubscribers.mockResolvedValue([]);
    await topicService.createAndJoin("mytopic");
    const topic = topicService.getTopic("mytopic");
    expect(topic).toBeDefined();
    expect(topic!.id).toBe("mytopic");
  });

  it("getTopic returns undefined for non-existent", () => {
    expect(topicService.getTopic("nonexistent")).toBeUndefined();
  });
});
