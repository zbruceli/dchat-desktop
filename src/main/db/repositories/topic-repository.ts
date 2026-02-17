import type Database from "better-sqlite3";
import type { Topic } from "../../../shared/types";

interface TopicRow {
  id: string;
  joined: number;
  subscribe_at: number | null;
  expire_block_height: number | null;
  member_count: number;
  created_at: number;
  updated_at: number;
}

function rowToTopic(row: TopicRow): Topic {
  return {
    id: row.id,
    joined: row.joined === 1,
    subscribeAt: row.subscribe_at ?? undefined,
    expireBlockHeight: row.expire_block_height ?? undefined,
    memberCount: row.member_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class TopicRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  upsert(topic: Topic): void {
    this.db
      .prepare(
        `INSERT INTO topic (id, joined, subscribe_at, expire_block_height, member_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           joined = excluded.joined,
           subscribe_at = excluded.subscribe_at,
           expire_block_height = excluded.expire_block_height,
           member_count = excluded.member_count,
           updated_at = excluded.updated_at`,
      )
      .run(
        topic.id,
        topic.joined ? 1 : 0,
        topic.subscribeAt ?? null,
        topic.expireBlockHeight ?? null,
        topic.memberCount,
        topic.createdAt,
        topic.updatedAt,
      );
  }

  findById(id: string): Topic | undefined {
    const row = this.db.prepare(`SELECT * FROM topic WHERE id = ?`).get(id) as
      | TopicRow
      | undefined;
    return row ? rowToTopic(row) : undefined;
  }

  findAll(): Topic[] {
    const rows = this.db
      .prepare(`SELECT * FROM topic ORDER BY updated_at DESC`)
      .all() as TopicRow[];
    return rows.map(rowToTopic);
  }

  findJoined(): Topic[] {
    const rows = this.db
      .prepare(`SELECT * FROM topic WHERE joined = 1 ORDER BY updated_at DESC`)
      .all() as TopicRow[];
    return rows.map(rowToTopic);
  }

  setJoined(
    id: string,
    joined: boolean,
    subscribeAt?: number,
    expireBlockHeight?: number,
  ): void {
    this.db
      .prepare(
        `UPDATE topic SET joined = ?, subscribe_at = COALESCE(?, subscribe_at), expire_block_height = COALESCE(?, expire_block_height), updated_at = ? WHERE id = ?`,
      )
      .run(joined ? 1 : 0, subscribeAt ?? null, expireBlockHeight ?? null, Date.now(), id);
  }

  setMemberCount(id: string, count: number): void {
    this.db
      .prepare(`UPDATE topic SET member_count = ?, updated_at = ? WHERE id = ?`)
      .run(count, Date.now(), id);
  }

  deleteById(id: string): void {
    this.db.prepare(`DELETE FROM topic WHERE id = ?`).run(id);
  }
}
