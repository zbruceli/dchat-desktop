import type Database from "better-sqlite3";

export function up(db: Database.Database): void {
  db.exec(`ALTER TABLE message ADD COLUMN delete_at INTEGER`);
  db.exec(`ALTER TABLE message ADD COLUMN is_delete INTEGER NOT NULL DEFAULT 0`);
  db.exec(
    `CREATE INDEX idx_message_delete_at ON message(delete_at) WHERE delete_at IS NOT NULL AND is_delete = 0`,
  );
}
