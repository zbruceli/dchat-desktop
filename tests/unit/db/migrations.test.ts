import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { up as migration001 } from "../../../src/main/db/migrations/001-initial-schema";
import { up as migration002 } from "../../../src/main/db/migrations/002-add-message-options";
import { up as migration003 } from "../../../src/main/db/migrations/003-add-thumbnail-path";
import { up as migration004 } from "../../../src/main/db/migrations/004-add-topic-tables";
import { up as migration005 } from "../../../src/main/db/migrations/005-add-contact-profile-version";
import { up as migration006 } from "../../../src/main/db/migrations/006-add-private-group-tables";
import { up as migration007 } from "../../../src/main/db/migrations/007-add-session-muted";
import { runMigrations } from "../../../src/main/db/migrations/migration-runner";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
});

afterEach(() => {
  db.close();
});

function getTableNames(): string[] {
  return (
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
      .all() as { name: string }[]
  ).map((r) => r.name);
}

function getColumnNames(table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (r) => r.name,
  );
}

function getIndexNames(): string[] {
  return (
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'`)
      .all() as { name: string }[]
  ).map((r) => r.name);
}

describe("Migration 001 — initial schema", () => {
  it("creates contact, session, message, and settings tables", () => {
    migration001(db);
    const tables = getTableNames();
    expect(tables).toContain("contact");
    expect(tables).toContain("session");
    expect(tables).toContain("message");
    expect(tables).toContain("settings");
  });

  it("creates indexes", () => {
    migration001(db);
    const indexes = getIndexNames();
    expect(indexes).toContain("idx_session_last_message_at");
    expect(indexes).toContain("idx_message_session_id");
    expect(indexes).toContain("idx_message_nkn_message_id");
  });

  it("enforces FK constraint on message.session_id", () => {
    migration001(db);
    // Inserting a message without a valid session should fail
    expect(() => {
      db.prepare(
        `INSERT INTO message (id, session_id, sender, receiver, content_type, content, status, is_outbound, created_at, updated_at)
         VALUES ('m1', 'nonexistent', 's', 'r', 'text', 'hi', 'sent', 1, 0, 0)`,
      ).run();
    }).toThrow();
  });
});

describe("Migration 003 — add thumbnail path", () => {
  it("adds thumbnail_local_file_path column with null default", () => {
    migration001(db);
    migration002(db);
    migration003(db);
    const columns = getColumnNames("message");
    expect(columns).toContain("thumbnail_local_file_path");

    // Insert a message and verify default is null
    db.prepare(
      `INSERT INTO session (id, type, target_address, target_name, created_at, updated_at) VALUES ('s1', 'direct', 'addr', 'name', 0, 0)`,
    ).run();
    db.prepare(
      `INSERT INTO message (id, session_id, sender, receiver, content_type, content, status, is_outbound, created_at, updated_at)
       VALUES ('m1', 's1', 's', 'r', 'text', 'hi', 'sent', 1, 0, 0)`,
    ).run();
    const msg = db.prepare(`SELECT thumbnail_local_file_path FROM message WHERE id = 'm1'`).get() as {
      thumbnail_local_file_path: string | null;
    };
    expect(msg.thumbnail_local_file_path).toBeNull();
  });
});

describe("Migration 004 — topic tables", () => {
  it("creates topic and topic_subscriber tables", () => {
    migration001(db);
    migration002(db);
    migration003(db);
    migration004(db);
    const tables = getTableNames();
    expect(tables).toContain("topic");
    expect(tables).toContain("topic_subscriber");
  });

  it("creates topic_subscriber index", () => {
    migration001(db);
    migration002(db);
    migration003(db);
    migration004(db);
    const indexes = getIndexNames();
    expect(indexes).toContain("idx_topic_subscriber_topic_id");
  });
});

describe("Migration 005 — contact profile version", () => {
  it("adds profile_version column to contact", () => {
    migration001(db);
    migration002(db);
    migration003(db);
    migration004(db);
    migration005(db);
    const columns = getColumnNames("contact");
    expect(columns).toContain("profile_version");
  });
});

describe("Migration 006 — private group tables", () => {
  it("creates private_group and private_group_member tables", () => {
    migration001(db);
    migration002(db);
    migration003(db);
    migration004(db);
    migration005(db);
    migration006(db);
    const tables = getTableNames();
    expect(tables).toContain("private_group");
    expect(tables).toContain("private_group_member");
  });

  it("creates private_group_member index", () => {
    migration001(db);
    migration002(db);
    migration003(db);
    migration004(db);
    migration005(db);
    migration006(db);
    const indexes = getIndexNames();
    expect(indexes).toContain("idx_pgm_group_id");
  });
});

describe("Migration 007 — session muted", () => {
  it("adds muted column with default 0", () => {
    migration001(db);
    migration002(db);
    migration003(db);
    migration004(db);
    migration005(db);
    migration006(db);
    migration007(db);
    const columns = getColumnNames("session");
    expect(columns).toContain("muted");

    // Insert a session and verify default
    db.prepare(
      `INSERT INTO session (id, type, target_address, target_name, created_at, updated_at) VALUES ('s1', 'direct', 'addr', 'name', 0, 0)`,
    ).run();
    const session = db.prepare(`SELECT muted FROM session WHERE id = 's1'`).get() as {
      muted: number;
    };
    expect(session.muted).toBe(0);
  });
});

describe("Migration runner", () => {
  it("runs all migrations and sets user_version", () => {
    runMigrations(db);
    const version = db.pragma("user_version", { simple: true }) as number;
    expect(version).toBe(9);
  });

  it("is idempotent (re-running skips already-applied)", () => {
    runMigrations(db);
    // Running again should not throw
    expect(() => runMigrations(db)).not.toThrow();
    const version = db.pragma("user_version", { simple: true }) as number;
    expect(version).toBe(9);
  });
});
