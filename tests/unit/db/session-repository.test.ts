import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3-multiple-ciphers";
import { SessionRepository } from "../../../src/main/db/repositories/session-repository";
import { createTestDb, makeSession } from "../../helpers/db-helpers";
import type { Session } from "../../../src/shared/types";

let db: Database.Database;
let repo: SessionRepository;

beforeEach(() => {
  db = createTestDb();
  repo = new SessionRepository(db);
});

afterEach(() => {
  db.close();
});

describe("SessionRepository", () => {
  describe("upsert", () => {
    it("inserts a new session", () => {
      const now = Date.now();
      const session: Session = {
        id: "direct:alice",
        type: "direct",
        targetAddress: "alice",
        targetName: "Alice",
        lastMessageContent: "Hello",
        lastMessageAt: now,
        unreadCount: 0,
        muted: false,
        createdAt: now,
        updatedAt: now,
      };
      repo.upsert(session);
      const found = repo.findById("direct:alice");
      expect(found).toBeDefined();
      expect(found!.targetName).toBe("Alice");
      expect(found!.type).toBe("direct");
    });

    it("updates existing session on conflict", () => {
      const now = Date.now();
      const session: Session = {
        id: "direct:alice",
        type: "direct",
        targetAddress: "alice",
        targetName: "Alice",
        lastMessageContent: "",
        lastMessageAt: now,
        unreadCount: 0,
        muted: false,
        createdAt: now,
        updatedAt: now,
      };
      repo.upsert(session);
      repo.upsert({ ...session, targetName: "Alice Updated", lastMessageContent: "Hi", updatedAt: now + 1 });
      const found = repo.findById("direct:alice");
      expect(found!.targetName).toBe("Alice Updated");
      expect(found!.lastMessageContent).toBe("Hi");
    });
  });

  describe("findAll", () => {
    it("returns sessions ordered by last_message_at DESC", () => {
      const now = Date.now();
      makeSession(db, "direct:old", { lastMessageAt: now - 2000, targetAddress: "old" });
      makeSession(db, "direct:new", { lastMessageAt: now, targetAddress: "new" });
      makeSession(db, "direct:mid", { lastMessageAt: now - 1000, targetAddress: "mid" });

      const sessions = repo.findAll();
      expect(sessions.map((s) => s.id)).toEqual(["direct:new", "direct:mid", "direct:old"]);
    });

    it("returns empty array when no sessions", () => {
      expect(repo.findAll()).toEqual([]);
    });
  });

  describe("findById", () => {
    it("returns the session by ID", () => {
      makeSession(db, "direct:alice", { targetName: "Alice", targetAddress: "alice" });
      const found = repo.findById("direct:alice");
      expect(found).toBeDefined();
      expect(found!.targetName).toBe("Alice");
    });

    it("returns undefined for non-existent ID", () => {
      expect(repo.findById("nonexistent")).toBeUndefined();
    });
  });

  describe("findByTargetAddress", () => {
    it("returns session by target address", () => {
      makeSession(db, "direct:alice.addr", { targetAddress: "alice.addr", targetName: "Alice" });
      const found = repo.findByTargetAddress("alice.addr");
      expect(found).toBeDefined();
      expect(found!.id).toBe("direct:alice.addr");
    });

    it("returns undefined for non-existent address", () => {
      expect(repo.findByTargetAddress("nonexistent")).toBeUndefined();
    });
  });

  describe("updateLastMessage", () => {
    it("updates last message content and timestamp", () => {
      makeSession(db, "direct:alice", { targetAddress: "alice" });
      const newTime = Date.now() + 1000;
      repo.updateLastMessage("direct:alice", "New message", newTime);
      const found = repo.findById("direct:alice");
      expect(found!.lastMessageContent).toBe("New message");
      expect(found!.lastMessageAt).toBe(newTime);
    });
  });

  describe("incrementUnread", () => {
    it("increments the unread count by 1", () => {
      makeSession(db, "direct:alice", { targetAddress: "alice", unreadCount: 0 });
      repo.incrementUnread("direct:alice");
      expect(repo.findById("direct:alice")!.unreadCount).toBe(1);
      repo.incrementUnread("direct:alice");
      expect(repo.findById("direct:alice")!.unreadCount).toBe(2);
    });
  });

  describe("resetUnread", () => {
    it("resets unread count to 0", () => {
      makeSession(db, "direct:alice", { targetAddress: "alice", unreadCount: 5 });
      repo.resetUnread("direct:alice");
      expect(repo.findById("direct:alice")!.unreadCount).toBe(0);
    });
  });

  describe("updateTargetName", () => {
    it("updates the target name", () => {
      makeSession(db, "direct:alice", { targetAddress: "alice", targetName: "Old" });
      repo.updateTargetName("direct:alice", "New Name");
      expect(repo.findById("direct:alice")!.targetName).toBe("New Name");
    });
  });

  describe("setMuted", () => {
    it("sets muted to true", () => {
      makeSession(db, "direct:alice", { targetAddress: "alice", muted: false });
      repo.setMuted("direct:alice", true);
      expect(repo.findById("direct:alice")!.muted).toBe(true);
    });

    it("sets muted back to false", () => {
      makeSession(db, "direct:alice", { targetAddress: "alice", muted: true });
      repo.setMuted("direct:alice", false);
      expect(repo.findById("direct:alice")!.muted).toBe(false);
    });
  });

  describe("deleteById", () => {
    it("deletes the session", () => {
      makeSession(db, "direct:alice", { targetAddress: "alice" });
      repo.deleteById("direct:alice");
      expect(repo.findById("direct:alice")).toBeUndefined();
    });

    it("does nothing for non-existent ID", () => {
      expect(() => repo.deleteById("nonexistent")).not.toThrow();
    });
  });
});
