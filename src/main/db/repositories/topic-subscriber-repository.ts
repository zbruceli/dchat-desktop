import type Database from "better-sqlite3";
import type { TopicSubscriber } from "../../../shared/types";

interface SubscriberRow {
  topic_id: string;
  contact_address: string;
  created_at: number;
}

function rowToSubscriber(row: SubscriberRow): TopicSubscriber {
  return {
    topicId: row.topic_id,
    contactAddress: row.contact_address,
    createdAt: row.created_at,
  };
}

export class TopicSubscriberRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  upsert(topicId: string, contactAddress: string): void {
    this.db
      .prepare(
        `INSERT INTO topic_subscriber (topic_id, contact_address, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(topic_id, contact_address) DO NOTHING`,
      )
      .run(topicId, contactAddress, Date.now());
  }

  findByTopicId(topicId: string): TopicSubscriber[] {
    const rows = this.db
      .prepare(`SELECT * FROM topic_subscriber WHERE topic_id = ? ORDER BY created_at ASC`)
      .all(topicId) as SubscriberRow[];
    return rows.map(rowToSubscriber);
  }

  deleteByTopicId(topicId: string): void {
    this.db.prepare(`DELETE FROM topic_subscriber WHERE topic_id = ?`).run(topicId);
  }

  deleteByTopicAndAddress(topicId: string, contactAddress: string): void {
    this.db
      .prepare(`DELETE FROM topic_subscriber WHERE topic_id = ? AND contact_address = ?`)
      .run(topicId, contactAddress);
  }

  replaceAll(topicId: string, subscribers: string[]): void {
    const txn = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM topic_subscriber WHERE topic_id = ?`).run(topicId);
      const insert = this.db.prepare(
        `INSERT INTO topic_subscriber (topic_id, contact_address, created_at) VALUES (?, ?, ?)`,
      );
      const now = Date.now();
      for (const addr of subscribers) {
        insert.run(topicId, addr, now);
      }
    });
    txn();
  }
}
