import type Database from "better-sqlite3";
import type { Session } from "../../../shared/types";

interface SessionRow {
  id: string;
  type: string;
  target_address: string;
  target_name: string;
  last_message_content: string;
  last_message_at: number;
  unread_count: number;
  created_at: number;
  updated_at: number;
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    type: row.type as Session["type"],
    targetAddress: row.target_address,
    targetName: row.target_name,
    lastMessageContent: row.last_message_content,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SessionRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  upsert(session: Session): void {
    this.db
      .prepare(
        `INSERT INTO session (id, type, target_address, target_name, last_message_content, last_message_at, unread_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           target_name = excluded.target_name,
           last_message_content = excluded.last_message_content,
           last_message_at = excluded.last_message_at,
           unread_count = excluded.unread_count,
           updated_at = excluded.updated_at`,
      )
      .run(
        session.id,
        session.type,
        session.targetAddress,
        session.targetName,
        session.lastMessageContent,
        session.lastMessageAt,
        session.unreadCount,
        session.createdAt,
        session.updatedAt,
      );
  }

  findAll(): Session[] {
    const rows = this.db
      .prepare(`SELECT * FROM session ORDER BY last_message_at DESC`)
      .all() as SessionRow[];
    return rows.map(rowToSession);
  }

  findById(id: string): Session | undefined {
    const row = this.db.prepare(`SELECT * FROM session WHERE id = ?`).get(id) as
      | SessionRow
      | undefined;
    return row ? rowToSession(row) : undefined;
  }

  findByTargetAddress(targetAddress: string): Session | undefined {
    const row = this.db
      .prepare(`SELECT * FROM session WHERE target_address = ?`)
      .get(targetAddress) as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  updateLastMessage(id: string, content: string, timestamp: number): void {
    this.db
      .prepare(
        `UPDATE session SET last_message_content = ?, last_message_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(content, timestamp, Date.now(), id);
  }

  incrementUnread(id: string): void {
    this.db
      .prepare(`UPDATE session SET unread_count = unread_count + 1, updated_at = ? WHERE id = ?`)
      .run(Date.now(), id);
  }

  resetUnread(id: string): void {
    this.db
      .prepare(`UPDATE session SET unread_count = 0, updated_at = ? WHERE id = ?`)
      .run(Date.now(), id);
  }

  deleteById(id: string): void {
    this.db.prepare(`DELETE FROM session WHERE id = ?`).run(id);
  }
}
