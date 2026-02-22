import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3-multiple-ciphers";
import { TopicRepository } from "../../../src/main/db/repositories/topic-repository";
import { createTestDb } from "../../helpers/db-helpers";
import type { Topic } from "../../../src/shared/types";

let db: Database.Database;
let repo: TopicRepository;

beforeEach(() => {
  db = createTestDb();
  repo = new TopicRepository(db);
});

afterEach(() => {
  db.close();
});

function makeTopic(id: string, overrides: Partial<Topic> = {}): Topic {
  const now = Date.now();
  return {
    id,
    joined: true,
    memberCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("TopicRepository", () => {
  describe("upsert", () => {
    it("inserts a new topic", () => {
      repo.upsert(makeTopic("general", { joined: true, memberCount: 3 }));
      const found = repo.findById("general");
      expect(found).toBeDefined();
      expect(found!.joined).toBe(true);
      expect(found!.memberCount).toBe(3);
    });

    it("updates existing topic on conflict", () => {
      repo.upsert(makeTopic("general", { memberCount: 3 }));
      repo.upsert(makeTopic("general", { memberCount: 5 }));
      expect(repo.findById("general")!.memberCount).toBe(5);
    });

    it("handles optional subscribeAt and expireBlockHeight", () => {
      repo.upsert(makeTopic("test", { subscribeAt: 1000, expireBlockHeight: 500000 }));
      const found = repo.findById("test");
      expect(found!.subscribeAt).toBe(1000);
      expect(found!.expireBlockHeight).toBe(500000);
    });
  });

  describe("findById", () => {
    it("returns undefined for non-existent topic", () => {
      expect(repo.findById("nonexistent")).toBeUndefined();
    });
  });

  describe("findAll", () => {
    it("returns all topics ordered by updated_at DESC", () => {
      const now = Date.now();
      repo.upsert(makeTopic("old", { updatedAt: now - 2000 }));
      repo.upsert(makeTopic("new", { updatedAt: now }));
      repo.upsert(makeTopic("mid", { updatedAt: now - 1000 }));
      const all = repo.findAll();
      expect(all.map((t) => t.id)).toEqual(["new", "mid", "old"]);
    });
  });

  describe("findJoined", () => {
    it("returns only joined topics", () => {
      repo.upsert(makeTopic("joined1", { joined: true }));
      repo.upsert(makeTopic("left", { joined: false }));
      repo.upsert(makeTopic("joined2", { joined: true }));
      const joined = repo.findJoined();
      expect(joined).toHaveLength(2);
      expect(joined.every((t) => t.joined)).toBe(true);
    });
  });

  describe("setJoined", () => {
    it("updates joined status", () => {
      repo.upsert(makeTopic("general", { joined: true }));
      repo.setJoined("general", false);
      expect(repo.findById("general")!.joined).toBe(false);
    });

    it("updates subscribeAt and expireBlockHeight when provided", () => {
      repo.upsert(makeTopic("general"));
      repo.setJoined("general", true, 12345, 600000);
      const found = repo.findById("general");
      expect(found!.subscribeAt).toBe(12345);
      expect(found!.expireBlockHeight).toBe(600000);
    });
  });

  describe("setMemberCount", () => {
    it("updates the member count", () => {
      repo.upsert(makeTopic("general", { memberCount: 0 }));
      repo.setMemberCount("general", 42);
      expect(repo.findById("general")!.memberCount).toBe(42);
    });
  });

  describe("deleteById", () => {
    it("deletes the topic", () => {
      repo.upsert(makeTopic("general"));
      repo.deleteById("general");
      expect(repo.findById("general")).toBeUndefined();
    });
  });

  describe("boolean mapping", () => {
    it("maps joined=1 to true and joined=0 to false", () => {
      repo.upsert(makeTopic("t1", { joined: true }));
      repo.upsert(makeTopic("t2", { joined: false }));
      expect(repo.findById("t1")!.joined).toBe(true);
      expect(repo.findById("t2")!.joined).toBe(false);
    });
  });
});
