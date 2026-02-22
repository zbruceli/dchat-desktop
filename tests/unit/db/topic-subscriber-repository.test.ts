import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3-multiple-ciphers";
import { TopicSubscriberRepository } from "../../../src/main/db/repositories/topic-subscriber-repository";
import { TopicRepository } from "../../../src/main/db/repositories/topic-repository";
import { createTestDb } from "../../helpers/db-helpers";

let db: Database.Database;
let repo: TopicSubscriberRepository;

beforeEach(() => {
  db = createTestDb();
  repo = new TopicSubscriberRepository(db);
  // Insert a parent topic for FK-free tables (topic_subscriber has no FK constraint)
});

afterEach(() => {
  db.close();
});

describe("TopicSubscriberRepository", () => {
  describe("upsert", () => {
    it("inserts a new subscriber", () => {
      repo.upsert("topic1", "alice.addr");
      const subs = repo.findByTopicId("topic1");
      expect(subs).toHaveLength(1);
      expect(subs[0].contactAddress).toBe("alice.addr");
      expect(subs[0].topicId).toBe("topic1");
    });

    it("is idempotent (upsert same subscriber twice)", () => {
      repo.upsert("topic1", "alice.addr");
      repo.upsert("topic1", "alice.addr");
      expect(repo.findByTopicId("topic1")).toHaveLength(1);
    });
  });

  describe("findByTopicId", () => {
    it("returns subscribers ordered by created_at ASC", () => {
      repo.upsert("topic1", "alice.addr");
      repo.upsert("topic1", "bob.addr");
      repo.upsert("topic1", "carol.addr");
      const subs = repo.findByTopicId("topic1");
      expect(subs).toHaveLength(3);
    });

    it("returns empty array for non-existent topic", () => {
      expect(repo.findByTopicId("nonexistent")).toEqual([]);
    });

    it("does not return subscribers from other topics", () => {
      repo.upsert("topic1", "alice.addr");
      repo.upsert("topic2", "bob.addr");
      const subs = repo.findByTopicId("topic1");
      expect(subs).toHaveLength(1);
      expect(subs[0].contactAddress).toBe("alice.addr");
    });
  });

  describe("deleteByTopicId", () => {
    it("deletes all subscribers for a topic", () => {
      repo.upsert("topic1", "alice.addr");
      repo.upsert("topic1", "bob.addr");
      repo.deleteByTopicId("topic1");
      expect(repo.findByTopicId("topic1")).toEqual([]);
    });
  });

  describe("deleteByTopicAndAddress", () => {
    it("deletes a specific subscriber", () => {
      repo.upsert("topic1", "alice.addr");
      repo.upsert("topic1", "bob.addr");
      repo.deleteByTopicAndAddress("topic1", "alice.addr");
      const subs = repo.findByTopicId("topic1");
      expect(subs).toHaveLength(1);
      expect(subs[0].contactAddress).toBe("bob.addr");
    });
  });

  describe("replaceAll", () => {
    it("replaces all subscribers atomically", () => {
      repo.upsert("topic1", "alice.addr");
      repo.upsert("topic1", "bob.addr");
      repo.replaceAll("topic1", ["carol.addr", "dave.addr"]);
      const subs = repo.findByTopicId("topic1");
      expect(subs).toHaveLength(2);
      expect(subs.map((s) => s.contactAddress).sort()).toEqual(["carol.addr", "dave.addr"]);
    });

    it("replaces with empty list (clears all)", () => {
      repo.upsert("topic1", "alice.addr");
      repo.replaceAll("topic1", []);
      expect(repo.findByTopicId("topic1")).toEqual([]);
    });

    it("does not affect other topics", () => {
      repo.upsert("topic1", "alice.addr");
      repo.upsert("topic2", "bob.addr");
      repo.replaceAll("topic1", ["carol.addr"]);
      expect(repo.findByTopicId("topic2")).toHaveLength(1);
    });
  });
});
