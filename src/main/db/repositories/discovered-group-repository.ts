import type Database from "better-sqlite3";
import type { DiscoveredGroup } from "../../../shared/types";

interface DiscoveredGroupRow {
  topic_name: string;
  description: string | null;
  category: string | null;
  subscriber_count: number;
  reported_by: string;
  last_reported_at: number;
  last_verified_at: number | null;
  created_at: number;
  updated_at: number;
}

function rowToGroup(row: DiscoveredGroupRow): DiscoveredGroup {
  return {
    topicName: row.topic_name,
    description: row.description ?? undefined,
    category: row.category ?? undefined,
    subscriberCount: row.subscriber_count,
    reportedBy: row.reported_by,
    lastReportedAt: row.last_reported_at,
    lastVerifiedAt: row.last_verified_at ?? undefined,
  };
}

export class DiscoveredGroupRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  upsert(group: DiscoveredGroup): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO discovered_group (topic_name, description, category, subscriber_count, reported_by, last_reported_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(topic_name) DO UPDATE SET
           description = COALESCE(excluded.description, discovered_group.description),
           category = COALESCE(excluded.category, discovered_group.category),
           subscriber_count = MAX(excluded.subscriber_count, discovered_group.subscriber_count),
           reported_by = excluded.reported_by,
           last_reported_at = MAX(excluded.last_reported_at, discovered_group.last_reported_at),
           updated_at = excluded.updated_at`,
      )
      .run(
        group.topicName,
        group.description ?? null,
        group.category ?? null,
        group.subscriberCount,
        group.reportedBy,
        group.lastReportedAt,
        now,
        now,
      );
  }

  findAll(): DiscoveredGroup[] {
    const rows = this.db
      .prepare(`SELECT * FROM discovered_group ORDER BY subscriber_count DESC`)
      .all() as DiscoveredGroupRow[];
    return rows.map(rowToGroup);
  }

  findByCategory(category: string): DiscoveredGroup[] {
    const rows = this.db
      .prepare(`SELECT * FROM discovered_group WHERE category = ? ORDER BY subscriber_count DESC`)
      .all(category) as DiscoveredGroupRow[];
    return rows.map(rowToGroup);
  }

  deleteStale(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    const result = this.db
      .prepare(`DELETE FROM discovered_group WHERE last_reported_at < ?`)
      .run(cutoff);
    return result.changes;
  }

  getCategories(): string[] {
    const rows = this.db
      .prepare(`SELECT DISTINCT category FROM discovered_group WHERE category IS NOT NULL ORDER BY category`)
      .all() as { category: string }[];
    return rows.map((r) => r.category);
  }

  updateSubscriberCount(topicName: string, count: number): void {
    this.db
      .prepare(
        `UPDATE discovered_group SET subscriber_count = ?, last_verified_at = ?, updated_at = ? WHERE topic_name = ?`,
      )
      .run(count, Date.now(), Date.now(), topicName);
  }

  findByTopicName(topicName: string): DiscoveredGroup | undefined {
    const row = this.db
      .prepare(`SELECT * FROM discovered_group WHERE topic_name = ?`)
      .get(topicName) as DiscoveredGroupRow | undefined;
    return row ? rowToGroup(row) : undefined;
  }
}
