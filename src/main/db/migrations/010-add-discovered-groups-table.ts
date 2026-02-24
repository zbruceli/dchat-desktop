import type Database from "better-sqlite3";

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE discovered_group (
      topic_name TEXT PRIMARY KEY,
      description TEXT,
      category TEXT,
      subscriber_count INTEGER DEFAULT 0,
      reported_by TEXT,
      last_reported_at INTEGER,
      last_verified_at INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE INDEX idx_discovered_group_subscriber_count ON discovered_group(subscriber_count DESC);
    CREATE INDEX idx_discovered_group_category ON discovered_group(category);
  `);
}
