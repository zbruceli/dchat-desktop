import type Database from "better-sqlite3";
import type { Contact } from "../../../shared/types";

interface ContactRow {
  address: string;
  name: string;
  avatar_uri: string | null;
  created_at: number;
  updated_at: number;
}

function rowToContact(row: ContactRow): Contact {
  return {
    address: row.address,
    name: row.name,
    avatarUri: row.avatar_uri ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ContactRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  upsert(contact: Contact): void {
    this.db
      .prepare(
        `INSERT INTO contact (address, name, avatar_uri, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET
           name = excluded.name,
           avatar_uri = excluded.avatar_uri,
           updated_at = excluded.updated_at`,
      )
      .run(
        contact.address,
        contact.name,
        contact.avatarUri ?? null,
        contact.createdAt,
        contact.updatedAt,
      );
  }

  findByAddress(address: string): Contact | undefined {
    const row = this.db.prepare(`SELECT * FROM contact WHERE address = ?`).get(address) as
      | ContactRow
      | undefined;
    return row ? rowToContact(row) : undefined;
  }

  findAll(): Contact[] {
    const rows = this.db
      .prepare(`SELECT * FROM contact ORDER BY name ASC, address ASC`)
      .all() as ContactRow[];
    return rows.map(rowToContact);
  }

  deleteByAddress(address: string): void {
    this.db.prepare(`DELETE FROM contact WHERE address = ?`).run(address);
  }
}
