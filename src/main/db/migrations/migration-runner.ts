import type Database from "better-sqlite3";
import { up as migration001 } from "./001-initial-schema";
import { up as migration002 } from "./002-add-message-options";
import { up as migration003 } from "./003-add-thumbnail-path";
import { up as migration004 } from "./004-add-topic-tables";
import { up as migration005 } from "./005-add-contact-profile-version";

interface Migration {
  version: number;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  { version: 1, up: migration001 },
  { version: 2, up: migration002 },
  { version: 3, up: migration003 },
  { version: 4, up: migration004 },
  { version: 5, up: migration005 },
];

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
