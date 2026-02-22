import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { up as migration001 } from "../../../src/main/db/migrations/001-initial-schema";
import { up as migration002 } from "../../../src/main/db/migrations/002-add-message-options";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
});

afterEach(() => {
  db.close();
});

describe("Migration 002 — add message options", () => {
  it("adds options and local_file_path columns to message table", () => {
    migration001(db);
    migration002(db);

    const columns = db
      .prepare("PRAGMA table_info(message)")
      .all() as { name: string; type: string }[];
    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("options");
    expect(columnNames).toContain("local_file_path");
  });

  it("new columns default to null", () => {
    migration001(db);

    // Insert a message before running migration 002
    db.prepare(
      `INSERT INTO session (id, type, target_address, target_name, last_message_content, last_message_at, unread_count, created_at, updated_at)
       VALUES ('s1', 'direct', 'addr', 'name', '', 0, 0, 1000, 1000)`,
    ).run();
    db.prepare(
      `INSERT INTO message (id, session_id, sender, receiver, content_type, content, status, is_outbound, created_at, updated_at)
       VALUES ('m1', 's1', 'alice', 'bob', 'text', 'hello', 'sent', 1, 1000, 1000)`,
    ).run();

    // Run migration 002
    migration002(db);

    const row = db.prepare("SELECT options, local_file_path FROM message WHERE id = 'm1'").get() as {
      options: string | null;
      local_file_path: string | null;
    };
    expect(row.options).toBeNull();
    expect(row.local_file_path).toBeNull();
  });

  it("allows writing to new columns after migration", () => {
    migration001(db);
    migration002(db);

    db.prepare(
      `INSERT INTO session (id, type, target_address, target_name, last_message_content, last_message_at, unread_count, created_at, updated_at)
       VALUES ('s1', 'direct', 'addr', 'name', '', 0, 0, 1000, 1000)`,
    ).run();

    db.prepare(
      `INSERT INTO message (id, session_id, sender, receiver, content_type, content, status, is_outbound, options, local_file_path, created_at, updated_at)
       VALUES ('m1', 's1', 'alice', 'bob', 'ipfs', 'thumb', 'sent', 1, '{"ipfsHash":"Qm123"}', '/cache/Qm123.jpg', 1000, 1000)`,
    ).run();

    const row = db.prepare("SELECT options, local_file_path FROM message WHERE id = 'm1'").get() as {
      options: string;
      local_file_path: string;
    };
    expect(row.options).toBe('{"ipfsHash":"Qm123"}');
    expect(row.local_file_path).toBe("/cache/Qm123.jpg");
  });

  it("does not affect other tables", () => {
    migration001(db);
    migration002(db);

    // contact, session, settings should be unmodified
    const contactCols = db
      .prepare("PRAGMA table_info(contact)")
      .all() as { name: string }[];
    expect(contactCols.map((c) => c.name)).not.toContain("options");

    const sessionCols = db
      .prepare("PRAGMA table_info(session)")
      .all() as { name: string }[];
    expect(sessionCols.map((c) => c.name)).not.toContain("options");
  });
});
