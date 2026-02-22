import type Database from "better-sqlite3";

export function up(db: Database.Database): void {
  db.exec(`ALTER TABLE session ADD COLUMN muted INTEGER NOT NULL DEFAULT 0`);
}
