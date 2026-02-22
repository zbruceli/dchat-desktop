import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3-multiple-ciphers";
import { PrivateGroupRepository } from "../../../src/main/db/repositories/private-group-repository";
import { createTestDb } from "../../helpers/db-helpers";
import type { PrivateGroup } from "../../../src/shared/types";

let db: Database.Database;
let repo: PrivateGroupRepository;

beforeEach(() => {
  db = createTestDb();
  repo = new PrivateGroupRepository(db);
});

afterEach(() => {
  db.close();
});

function makeGroup(groupId: string, overrides: Partial<PrivateGroup> = {}): PrivateGroup {
  const now = Date.now();
  return {
    groupId,
    type: 0,
    name: overrides.name ?? "Test Group",
    count: overrides.count ?? 0,
    joined: overrides.joined ?? true,
    signature: overrides.signature ?? "sig123",
    version: overrides.version ?? "1.abc",
    data: overrides.data ?? "{}",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

describe("PrivateGroupRepository", () => {
  describe("upsert", () => {
    it("inserts a new group", () => {
      repo.upsert(makeGroup("group-1", { name: "My Group" }));
      const found = repo.findById("group-1");
      expect(found).toBeDefined();
      expect(found!.name).toBe("My Group");
      expect(found!.groupId).toBe("group-1");
    });

    it("updates existing group on conflict", () => {
      repo.upsert(makeGroup("group-1", { name: "Original" }));
      repo.upsert(makeGroup("group-1", { name: "Updated" }));
      expect(repo.findById("group-1")!.name).toBe("Updated");
    });
  });

  describe("findById", () => {
    it("returns undefined for non-existent group", () => {
      expect(repo.findById("nonexistent")).toBeUndefined();
    });
  });

  describe("findAll", () => {
    it("returns all groups ordered by updated_at DESC", () => {
      const now = Date.now();
      repo.upsert(makeGroup("g-old", { updatedAt: now - 2000 }));
      repo.upsert(makeGroup("g-new", { updatedAt: now }));
      repo.upsert(makeGroup("g-mid", { updatedAt: now - 1000 }));
      const all = repo.findAll();
      expect(all.map((g) => g.groupId)).toEqual(["g-new", "g-mid", "g-old"]);
    });
  });

  describe("findJoined", () => {
    it("returns only joined groups", () => {
      repo.upsert(makeGroup("g1", { joined: true }));
      repo.upsert(makeGroup("g2", { joined: false }));
      repo.upsert(makeGroup("g3", { joined: true }));
      const joined = repo.findJoined();
      expect(joined).toHaveLength(2);
      expect(joined.every((g) => g.joined)).toBe(true);
    });
  });

  describe("setJoined", () => {
    it("updates joined status", () => {
      repo.upsert(makeGroup("g1", { joined: true }));
      repo.setJoined("g1", false);
      expect(repo.findById("g1")!.joined).toBe(false);
    });
  });

  describe("setCount", () => {
    it("updates the member count", () => {
      repo.upsert(makeGroup("g1", { count: 0 }));
      repo.setCount("g1", 5);
      expect(repo.findById("g1")!.count).toBe(5);
    });
  });

  describe("setVersion", () => {
    it("updates the version string", () => {
      repo.upsert(makeGroup("g1", { version: "1.abc" }));
      repo.setVersion("g1", "2.def");
      expect(repo.findById("g1")!.version).toBe("2.def");
    });
  });

  describe("setSignature", () => {
    it("updates the signature", () => {
      repo.upsert(makeGroup("g1", { signature: "old-sig" }));
      repo.setSignature("g1", "new-sig");
      expect(repo.findById("g1")!.signature).toBe("new-sig");
    });
  });

  describe("deleteById", () => {
    it("deletes the group", () => {
      repo.upsert(makeGroup("g1"));
      repo.deleteById("g1");
      expect(repo.findById("g1")).toBeUndefined();
    });
  });

  describe("boolean mapping", () => {
    it("maps joined=1 to true and joined=0 to false", () => {
      repo.upsert(makeGroup("g-true", { joined: true }));
      repo.upsert(makeGroup("g-false", { joined: false }));
      expect(repo.findById("g-true")!.joined).toBe(true);
      expect(repo.findById("g-false")!.joined).toBe(false);
    });
  });
});
