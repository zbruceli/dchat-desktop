import type Database from "better-sqlite3";

export function up(db: Database.Database): void {
  db.exec(`
    ALTER TABLE message ADD COLUMN thumbnail_local_file_path TEXT;
  `);
}
