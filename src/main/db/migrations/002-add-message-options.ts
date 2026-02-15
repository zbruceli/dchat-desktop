import type Database from "better-sqlite3";

export function up(db: Database.Database): void {
  db.exec(`
    ALTER TABLE message ADD COLUMN options TEXT;
    ALTER TABLE message ADD COLUMN local_file_path TEXT;
  `);
}
