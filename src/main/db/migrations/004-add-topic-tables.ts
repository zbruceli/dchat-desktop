import type Database from "better-sqlite3";

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE topic (
      id TEXT PRIMARY KEY,
      joined INTEGER DEFAULT 0,
      subscribe_at INTEGER,
      expire_block_height INTEGER,
      member_count INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE topic_subscriber (
      topic_id TEXT NOT NULL,
      contact_address TEXT NOT NULL,
      created_at INTEGER,
      PRIMARY KEY (topic_id, contact_address)
    );

    CREATE INDEX idx_topic_subscriber_topic_id ON topic_subscriber(topic_id);
  `);
}
