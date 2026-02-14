import type Database from "better-sqlite3";
import { up as migration001 } from "./001-initial-schema";

interface Migration {
  version: number;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [{ version: 1, up: migration001 }];

export function runMigrations(db: Database.Database): void {
  const currentVersion = db.pragma("user_version", { simple: true }) as number;

  const pending = migrations.filter((m) => m.version > currentVersion);
  if (pending.length === 0) return;

  const migrate = db.transaction(() => {
    for (const migration of pending) {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    }
  });

  migrate();
}
