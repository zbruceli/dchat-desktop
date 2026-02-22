import type Database from "better-sqlite3";
import type { Message, MessageStatus } from "../../../shared/types";

interface MessageRow {
  id: string;
  session_id: string;
  sender: string;
  receiver: string;
  content_type: string;
  content: string;
  status: string;
  is_outbound: number;
  nkn_message_id: string | null;
  options: string | null;
  local_file_path: string | null;
  thumbnail_local_file_path: string | null;
  created_at: number;
  updated_at: number;
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    sessionId: row.session_id,
    sender: row.sender,
    receiver: row.receiver,
    contentType: row.content_type as Message["contentType"],
    content: row.content,
    status: row.status as MessageStatus,
    isOutbound: row.is_outbound === 1,
    nknMessageId: row.nkn_message_id ?? undefined,
    options: row.options ?? undefined,
    localFilePath: row.local_file_path ?? undefined,
    thumbnailLocalFilePath: row.thumbnail_local_file_path ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MessageRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  insert(message: Message): void {
    this.db
      .prepare(
        `INSERT INTO message (id, session_id, sender, receiver, content_type, content, status, is_outbound, nkn_message_id, options, local_file_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        message.id,
        message.sessionId,
        message.sender,
        message.receiver,
        message.contentType,
        message.content,
        message.status,
        message.isOutbound ? 1 : 0,
        message.nknMessageId ?? null,
        message.options ?? null,
        message.localFilePath ?? null,
        message.createdAt,
        message.updatedAt,
      );
  }

  findBySessionId(sessionId: string, limit = 100, offset = 0): Message[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM message WHERE session_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?`,
      )
      .all(sessionId, limit, offset) as MessageRow[];
    return rows.map(rowToMessage);
  }

  findById(id: string): Message | undefined {
    const row = this.db.prepare(`SELECT * FROM message WHERE id = ?`).get(id) as
      | MessageRow
      | undefined;
    return row ? rowToMessage(row) : undefined;
  }

  findByNknMessageId(nknMessageId: string): Message | undefined {
    const row = this.db
      .prepare(`SELECT * FROM message WHERE nkn_message_id = ?`)
      .get(nknMessageId) as MessageRow | undefined;
    return row ? rowToMessage(row) : undefined;
  }

  updateStatus(id: string, status: MessageStatus): void {
    this.db
      .prepare(`UPDATE message SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, Date.now(), id);
  }

  updateSessionId(oldSessionId: string, newSessionId: string): void {
    this.db
      .prepare(`UPDATE message SET session_id = ?, updated_at = ? WHERE session_id = ?`)
      .run(newSessionId, Date.now(), oldSessionId);
  }

  updateLocalFilePath(id: string, localFilePath: string): void {
    this.db
      .prepare(`UPDATE message SET local_file_path = ?, updated_at = ? WHERE id = ?`)
      .run(localFilePath, Date.now(), id);
  }

  updateThumbnailLocalFilePath(id: string, thumbnailPath: string): void {
    this.db
      .prepare(`UPDATE message SET thumbnail_local_file_path = ?, updated_at = ? WHERE id = ?`)
      .run(thumbnailPath, Date.now(), id);
  }

  updateOptions(id: string, optionsJson: string): void {
    this.db
      .prepare(`UPDATE message SET options = ?, updated_at = ? WHERE id = ?`)
      .run(optionsJson, Date.now(), id);
  }

  updateContent(id: string, content: string): void {
    this.db
      .prepare(`UPDATE message SET content = ?, updated_at = ? WHERE id = ?`)
      .run(content, Date.now(), id);
  }

  updateContentType(id: string, contentType: string): void {
    this.db
      .prepare(`UPDATE message SET content_type = ?, updated_at = ? WHERE id = ?`)
      .run(contentType, Date.now(), id);
  }

  updateStatusBatch(ids: string[], status: MessageStatus): void {
    if (ids.length === 0) return;
    const now = Date.now();
    const placeholders = ids.map(() => "?").join(", ");
    this.db
      .prepare(
        `UPDATE message SET status = ?, updated_at = ? WHERE id IN (${placeholders})`,
      )
      .run(status, now, ...ids);
  }

  findInboundBySessionIdAndStatus(
    sessionId: string,
    excludeStatus: MessageStatus,
  ): Message[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM message WHERE session_id = ? AND is_outbound = 0 AND status != ? ORDER BY created_at ASC`,
      )
      .all(sessionId, excludeStatus) as MessageRow[];
    return rows.map(rowToMessage);
  }

  deleteBySessionId(sessionId: string): void {
    this.db.prepare(`DELETE FROM message WHERE session_id = ?`).run(sessionId);
  }
}
