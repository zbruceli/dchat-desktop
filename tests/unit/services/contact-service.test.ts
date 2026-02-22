import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type Database from "better-sqlite3-multiple-ciphers";
import { ContactService } from "../../../src/main/services/contact-service";
import { ContactRepository } from "../../../src/main/db/repositories/contact-repository";
import { createTestDb } from "../../helpers/db-helpers";

let db: Database.Database;
let contactRepo: ContactRepository;
let tmpDir: string;
let contactService: ContactService;

beforeEach(() => {
  db = createTestDb();
  contactRepo = new ContactRepository(db);
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dchat-contact-test-"));
  contactService = new ContactService(contactRepo, tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ContactService", () => {
  describe("addContact", () => {
    it("adds contact with name", () => {
      const contact = contactService.addContact({ address: "alice.addr", name: "Alice" });
      expect(contact.address).toBe("alice.addr");
      expect(contact.name).toBe("Alice");
    });

    it("adds contact without name (defaults to truncated address)", () => {
      const contact = contactService.addContact({ address: "long-address-here" });
      expect(contact.name).toBe("long-add...");
    });

    it("persists in database", () => {
      contactService.addContact({ address: "alice.addr", name: "Alice" });
      const found = contactRepo.findByAddress("alice.addr");
      expect(found).toBeDefined();
      expect(found!.name).toBe("Alice");
    });
  });

  describe("updateContact", () => {
    it("updates contact name", () => {
      contactService.addContact({ address: "alice.addr", name: "Alice" });
      const updated = contactService.updateContact({ address: "alice.addr", name: "Alice Updated" });
      expect(updated).toBeDefined();
      expect(updated!.name).toBe("Alice Updated");
    });

    it("returns undefined for non-existent contact", () => {
      const result = contactService.updateContact({ address: "nonexistent", name: "Test" });
      expect(result).toBeUndefined();
    });
  });

  describe("getContact", () => {
    it("returns contact by address", () => {
      contactService.addContact({ address: "alice.addr", name: "Alice" });
      const contact = contactService.getContact("alice.addr");
      expect(contact).toBeDefined();
      expect(contact!.name).toBe("Alice");
    });

    it("returns undefined for non-existent", () => {
      expect(contactService.getContact("nonexistent")).toBeUndefined();
    });
  });

  describe("listContacts", () => {
    it("returns all contacts sorted", () => {
      contactService.addContact({ address: "z.addr", name: "Zara" });
      contactService.addContact({ address: "a.addr", name: "Alice" });
      const contacts = contactService.listContacts();
      expect(contacts).toHaveLength(2);
      expect(contacts[0].name).toBe("Alice");
      expect(contacts[1].name).toBe("Zara");
    });
  });

  describe("deleteContact", () => {
    it("deletes existing contact", () => {
      contactService.addContact({ address: "alice.addr", name: "Alice" });
      contactService.deleteContact("alice.addr");
      expect(contactService.getContact("alice.addr")).toBeUndefined();
    });
  });

  describe("setContactAvatar", () => {
    it("resizes and saves avatar as JPEG", async () => {
      contactService.addContact({ address: "alice.addr", name: "Alice" });

      // Create a test image using sharp
      const sharp = (await import("sharp")).default;
      const testImagePath = path.join(tmpDir, "test-avatar.png");
      await sharp({
        create: {
          width: 400,
          height: 400,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .png()
        .toFile(testImagePath);

      const result = await contactService.setContactAvatar("alice.addr", testImagePath);
      expect(result).toBeDefined();
      expect(result!.avatarUri).toMatch(/\.jpg$/);
    });

    it("returns undefined for non-existent contact", async () => {
      const result = await contactService.setContactAvatar("nonexistent", "/fake/path.jpg");
      expect(result).toBeUndefined();
    });
  });

  describe("constructor", () => {
    it("creates contact-cache directory", () => {
      expect(fs.existsSync(path.join(tmpDir, "contact-cache"))).toBe(true);
    });
  });
});
