import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { MessageRepository } from "../../../src/main/db/repositories/message-repository";
import { runMigrations } from "../../../src/main/db/migrations/migration-runner";
import type { Message } from "../../../src/shared/types";

let db: Database.Database;
let repo: MessageRepository;

function makeSession(id: string, targetAddress: string): void {
  db.prepare(
    `INSERT INTO session (id, type, target_address, target_name, last_message_content, last_message_at, unread_count, created_at, updated_at)
     VALUES (?, 'direct', ?, '', '', 0, 0, ?, ?)`,
  ).run(id, targetAddress, Date.now(), Date.now());
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-" + Math.random().toString(36).slice(2),
    sessionId: "session-1",
    sender: "alice",
    receiver: "bob",
    contentType: "text",
    content: "hello",
    status: "sent",
    isOutbound: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  makeSession("session-1", "bob");
  repo = new MessageRepository(db);
});

afterEach(() => {
  db.close();
});

describe("MessageRepository", () => {
  describe("insert and find with new columns", () => {
    it("inserts a message with options and localFilePath", () => {
      const opts = JSON.stringify({ ipfsHash: "QmTest", fileType: "image" });
      const msg = makeMessage({
        options: opts,
        localFilePath: "/path/to/image.jpg",
      });

      repo.insert(msg);
      const found = repo.findById(msg.id);

      expect(found).toBeDefined();
      expect(found!.options).toBe(opts);
      expect(found!.localFilePath).toBe("/path/to/image.jpg");
    });

    it("inserts a message with null options and localFilePath", () => {
      const msg = makeMessage();
      repo.insert(msg);
      const found = repo.findById(msg.id);

      expect(found).toBeDefined();
      expect(found!.options).toBeUndefined();
      expect(found!.localFilePath).toBeUndefined();
    });

    it("returns options and localFilePath from findBySessionId", () => {
      const msg = makeMessage({
        options: '{"ipfsHash":"Qm123"}',
        localFilePath: "/cache/Qm123.jpg",
      });
      repo.insert(msg);

      const messages = repo.findBySessionId("session-1");
      expect(messages).toHaveLength(1);
      expect(messages[0].options).toBe('{"ipfsHash":"Qm123"}');
      expect(messages[0].localFilePath).toBe("/cache/Qm123.jpg");
    });
  });

  describe("updateLocalFilePath", () => {
    it("updates the local file path of a message", () => {
      const msg = makeMessage();
      repo.insert(msg);

      repo.updateLocalFilePath(msg.id, "/new/path.jpg");
      const found = repo.findById(msg.id);

      expect(found!.localFilePath).toBe("/new/path.jpg");
      expect(found!.updatedAt).toBeGreaterThanOrEqual(msg.updatedAt);
    });

    it("does not affect other messages", () => {
      const msg1 = makeMessage({ id: "msg-1" });
      const msg2 = makeMessage({ id: "msg-2" });
      repo.insert(msg1);
      repo.insert(msg2);

      repo.updateLocalFilePath("msg-1", "/path1.jpg");

      expect(repo.findById("msg-1")!.localFilePath).toBe("/path1.jpg");
      expect(repo.findById("msg-2")!.localFilePath).toBeUndefined();
    });
  });

  describe("updateOptions", () => {
    it("updates options JSON on a message", () => {
      const msg = makeMessage();
      repo.insert(msg);

      const newOpts = JSON.stringify({ ipfsHash: "QmNew", fileSize: 1024 });
      repo.updateOptions(msg.id, newOpts);

      const found = repo.findById(msg.id);
      expect(found!.options).toBe(newOpts);
    });
  });

  describe("updateContent", () => {
    it("updates the content of a message", () => {
      const msg = makeMessage({ content: "old content" });
      repo.insert(msg);

      repo.updateContent(msg.id, "new thumbnail base64");

      const found = repo.findById(msg.id);
      expect(found!.content).toBe("new thumbnail base64");
    });
  });

  describe("migration 002 — existing data preserved", () => {
    it("existing messages get null options and local_file_path", () => {
      // The message was inserted after migrations ran, but the columns
      // default to null — verify that's what we get
      const msg = makeMessage();
      repo.insert(msg);

      const row = db.prepare("SELECT options, local_file_path FROM message WHERE id = ?").get(msg.id) as {
        options: string | null;
        local_file_path: string | null;
      };
      expect(row.options).toBeNull();
      expect(row.local_file_path).toBeNull();
    });
  });
});
