import Database from "better-sqlite3";
import path from "path";
import { runMigrations } from "./migrations/migration-runner";

let db: Database.Database | null = null;

export function initDatabase(userDataPath: string): Database.Database {
  if (db) return db;

  const dbPath = path.join(userDataPath, "dchat.db");
  db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  runMigrations(db);

  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
