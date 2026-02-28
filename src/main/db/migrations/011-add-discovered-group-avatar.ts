import type Database from "better-sqlite3";

export function up(db: Database.Database): void {
  db.exec(`ALTER TABLE discovered_group ADD COLUMN avatar_uri TEXT;`);
}
