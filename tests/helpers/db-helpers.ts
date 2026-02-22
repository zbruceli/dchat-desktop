import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../../src/main/db/migrations/migration-runner";
import type { Message, Session, Contact } from "../../src/shared/types";

/**
 * Create an in-memory SQLite database with all migrations applied.
 * Caller is responsible for closing the database in afterEach.
 */
export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

/**
 * Build a Message object with sensible defaults, overridable via spread.
 */
export function makeMessage(overrides: Partial<Message> = {}): Message {
  const now = Date.now();
  return {
    id: "msg-" + Math.random().toString(36).slice(2),
    sessionId: "direct:test-session",
    sender: "sender.address",
    receiver: "receiver.address",
    contentType: "text",
    content: "Hello",
    status: "sent",
    isOutbound: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Insert a contact row directly into the database.
 */
export function makeContact(
  db: Database.Database,
  address: string,
  overrides: Partial<Contact> = {},
): Contact {
  const now = Date.now();
  const contact: Contact = {
    address,
    name: overrides.name ?? address.substring(0, 8) + "...",
    avatarUri: overrides.avatarUri,
    profileVersion: overrides.profileVersion,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
  db.prepare(
    `INSERT INTO contact (address, name, avatar_uri, profile_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    contact.address,
    contact.name,
    contact.avatarUri ?? null,
    contact.profileVersion ?? null,
    contact.createdAt,
    contact.updatedAt,
  );
  return contact;
}

/**
 * Insert a session row directly into the database.
 */
export function makeSession(
  db: Database.Database,
  id: string,
  overrides: Partial<Session> = {},
): Session {
  const now = Date.now();
  const session: Session = {
    id,
    type: overrides.type ?? "direct",
    targetAddress: overrides.targetAddress ?? id.replace("direct:", ""),
    targetName: overrides.targetName ?? "Test User",
    lastMessageContent: overrides.lastMessageContent ?? "",
    lastMessageAt: overrides.lastMessageAt ?? now,
    unreadCount: overrides.unreadCount ?? 0,
    muted: overrides.muted ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
  db.prepare(
    `INSERT INTO session (id, type, target_address, target_name, last_message_content, last_message_at, unread_count, muted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    session.id,
    session.type,
    session.targetAddress,
    session.targetName,
    session.lastMessageContent,
    session.lastMessageAt,
    session.unreadCount,
    session.muted ? 1 : 0,
    session.createdAt,
    session.updatedAt,
  );
  return session;
}
