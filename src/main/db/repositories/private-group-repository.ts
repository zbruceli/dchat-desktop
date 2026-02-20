import type Database from "better-sqlite3";
import type { PrivateGroup } from "../../../shared/types";

interface PrivateGroupRow {
  group_id: string;
  type: number;
  name: string;
  count: number;
  joined: number;
  signature: string;
  version: string;
  data: string;
  created_at: number;
  updated_at: number;
}

function rowToGroup(row: PrivateGroupRow): PrivateGroup {
  return {
    groupId: row.group_id,
    type: row.type,
    name: row.name,
    count: row.count,
    joined: row.joined === 1,
    signature: row.signature,
    version: row.version,
    data: row.data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PrivateGroupRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  upsert(group: PrivateGroup): void {
    this.db
      .prepare(
        `INSERT INTO private_group (group_id, type, name, count, joined, signature, version, data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(group_id) DO UPDATE SET
           type = excluded.type,
           name = excluded.name,
           count = excluded.count,
           joined = excluded.joined,
           signature = excluded.signature,
           version = excluded.version,
           data = excluded.data,
           updated_at = excluded.updated_at`,
      )
      .run(
        group.groupId,
        group.type,
        group.name,
        group.count,
        group.joined ? 1 : 0,
        group.signature,
        group.version,
        group.data,
        group.createdAt,
        group.updatedAt,
      );
  }

  findById(groupId: string): PrivateGroup | undefined {
    const row = this.db
      .prepare(`SELECT * FROM private_group WHERE group_id = ?`)
      .get(groupId) as PrivateGroupRow | undefined;
    return row ? rowToGroup(row) : undefined;
  }

  findAll(): PrivateGroup[] {
    const rows = this.db
      .prepare(`SELECT * FROM private_group ORDER BY updated_at DESC`)
      .all() as PrivateGroupRow[];
    return rows.map(rowToGroup);
  }

  findJoined(): PrivateGroup[] {
    const rows = this.db
      .prepare(`SELECT * FROM private_group WHERE joined = 1 ORDER BY updated_at DESC`)
      .all() as PrivateGroupRow[];
    return rows.map(rowToGroup);
  }

  setJoined(groupId: string, joined: boolean): void {
    this.db
      .prepare(`UPDATE private_group SET joined = ?, updated_at = ? WHERE group_id = ?`)
      .run(joined ? 1 : 0, Date.now(), groupId);
  }

  setCount(groupId: string, count: number): void {
    this.db
      .prepare(`UPDATE private_group SET count = ?, updated_at = ? WHERE group_id = ?`)
      .run(count, Date.now(), groupId);
  }

  setVersion(groupId: string, version: string): void {
    this.db
      .prepare(`UPDATE private_group SET version = ?, updated_at = ? WHERE group_id = ?`)
      .run(version, Date.now(), groupId);
  }

  setSignature(groupId: string, signature: string): void {
    this.db
      .prepare(`UPDATE private_group SET signature = ?, updated_at = ? WHERE group_id = ?`)
      .run(signature, Date.now(), groupId);
  }

  deleteById(groupId: string): void {
    this.db.prepare(`DELETE FROM private_group WHERE group_id = ?`).run(groupId);
  }
}
