import type Database from "better-sqlite3";

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS private_group (
      group_id TEXT PRIMARY KEY,
      type INTEGER DEFAULT 0,
      name TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      joined INTEGER DEFAULT 0,
      signature TEXT DEFAULT '',
      version TEXT DEFAULT '',
      data TEXT DEFAULT '{}',
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS private_group_member (
      group_id TEXT NOT NULL,
      permission INTEGER DEFAULT 0,
      expires_at INTEGER,
      inviter TEXT,
      invitee TEXT,
      inviter_raw_data TEXT,
      invitee_raw_data TEXT,
      inviter_signature TEXT,
      invitee_signature TEXT,
      PRIMARY KEY (group_id, invitee)
    );

    CREATE INDEX IF NOT EXISTS idx_pgm_group_id ON private_group_member(group_id);
  `);
}
