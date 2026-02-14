import type Database from "better-sqlite3";

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact (
      address TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      avatar_uri TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'direct',
      target_address TEXT NOT NULL,
      target_name TEXT NOT NULL DEFAULT '',
      last_message_content TEXT NOT NULL DEFAULT '',
      last_message_at INTEGER NOT NULL DEFAULT 0,
      unread_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_session_last_message_at ON session(last_message_at DESC);

    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      receiver TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'text',
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'sending',
      is_outbound INTEGER NOT NULL DEFAULT 0,
      nkn_message_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_message_session_id ON message(session_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_message_nkn_message_id ON message(nkn_message_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}
