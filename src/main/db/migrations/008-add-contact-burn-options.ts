import type Database from "better-sqlite3";

export function up(db: Database.Database): void {
  db.exec(`ALTER TABLE contact ADD COLUMN burn_after_seconds INTEGER DEFAULT 0`);
  db.exec(`ALTER TABLE contact ADD COLUMN burn_update_at INTEGER DEFAULT 0`);
}
