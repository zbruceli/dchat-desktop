import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3-multiple-ciphers";
import { ContactRepository } from "../../../src/main/db/repositories/contact-repository";
import { createTestDb } from "../../helpers/db-helpers";
import type { Contact } from "../../../src/shared/types";

let db: Database.Database;
let repo: ContactRepository;

beforeEach(() => {
  db = createTestDb();
  repo = new ContactRepository(db);
});

afterEach(() => {
  db.close();
});

function makeContact(address: string, overrides: Partial<Contact> = {}): Contact {
  const now = Date.now();
  return {
    address,
    name: overrides.name ?? address.substring(0, 8),
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    ...overrides,
  };
}

describe("ContactRepository", () => {
  describe("upsert", () => {
    it("inserts a new contact", () => {
      const contact = makeContact("alice.addr", { name: "Alice" });
      repo.upsert(contact);
      const found = repo.findByAddress("alice.addr");
      expect(found).toBeDefined();
      expect(found!.name).toBe("Alice");
      expect(found!.address).toBe("alice.addr");
    });

    it("updates existing contact on conflict", () => {
      const contact = makeContact("alice.addr", { name: "Alice" });
      repo.upsert(contact);
      repo.upsert({ ...contact, name: "Alice Updated", updatedAt: Date.now() });
      const found = repo.findByAddress("alice.addr");
      expect(found!.name).toBe("Alice Updated");
    });

    it("handles optional avatarUri and profileVersion", () => {
      const contact = makeContact("bob.addr", {
        name: "Bob",
        avatarUri: "avatar.jpg",
        profileVersion: "v1",
      });
      repo.upsert(contact);
      const found = repo.findByAddress("bob.addr");
      expect(found!.avatarUri).toBe("avatar.jpg");
      expect(found!.profileVersion).toBe("v1");
    });

    it("stores undefined avatarUri as null", () => {
      const contact = makeContact("carol.addr", { name: "Carol" });
      repo.upsert(contact);
      const found = repo.findByAddress("carol.addr");
      expect(found!.avatarUri).toBeUndefined();
    });
  });

  describe("findByAddress", () => {
    it("returns undefined for non-existent address", () => {
      expect(repo.findByAddress("nonexistent")).toBeUndefined();
    });

    it("returns the correct contact", () => {
      repo.upsert(makeContact("alice.addr", { name: "Alice" }));
      repo.upsert(makeContact("bob.addr", { name: "Bob" }));
      const found = repo.findByAddress("bob.addr");
      expect(found!.name).toBe("Bob");
    });
  });

  describe("findAll", () => {
    it("returns empty array when no contacts", () => {
      expect(repo.findAll()).toEqual([]);
    });

    it("returns contacts sorted by name ASC then address ASC", () => {
      repo.upsert(makeContact("z-addr", { name: "Zara" }));
      repo.upsert(makeContact("a-addr", { name: "Alice" }));
      repo.upsert(makeContact("m-addr", { name: "Mike" }));
      const all = repo.findAll();
      expect(all.map((c) => c.name)).toEqual(["Alice", "Mike", "Zara"]);
    });
  });

  describe("updateProfile", () => {
    it("updates name, avatarUri, and profileVersion", () => {
      repo.upsert(makeContact("alice.addr", { name: "Alice" }));
      repo.updateProfile("alice.addr", "Alice New", "new-avatar.jpg", "v2");
      const found = repo.findByAddress("alice.addr");
      expect(found!.name).toBe("Alice New");
      expect(found!.avatarUri).toBe("new-avatar.jpg");
      expect(found!.profileVersion).toBe("v2");
    });

    it("sets avatarUri to null", () => {
      repo.upsert(makeContact("alice.addr", { name: "Alice", avatarUri: "old.jpg" }));
      repo.updateProfile("alice.addr", "Alice", null, "v3");
      const found = repo.findByAddress("alice.addr");
      expect(found!.avatarUri).toBeUndefined();
    });
  });

  describe("deleteByAddress", () => {
    it("deletes an existing contact", () => {
      repo.upsert(makeContact("alice.addr", { name: "Alice" }));
      repo.deleteByAddress("alice.addr");
      expect(repo.findByAddress("alice.addr")).toBeUndefined();
    });

    it("does nothing for non-existent address", () => {
      expect(() => repo.deleteByAddress("nonexistent")).not.toThrow();
    });
  });
});
