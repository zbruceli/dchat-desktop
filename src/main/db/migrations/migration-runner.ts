import type Database from "better-sqlite3";
import { up as migration001 } from "./001-initial-schema";
import { up as migration002 } from "./002-add-message-options";
import { up as migration003 } from "./003-add-thumbnail-path";
import { up as migration004 } from "./004-add-topic-tables";
import { up as migration005 } from "./005-add-contact-profile-version";
import { up as migration006 } from "./006-add-private-group-tables";
import { up as migration007 } from "./007-add-session-muted";
import { up as migration008 } from "./008-add-contact-burn-options";
import { up as migration009 } from "./009-add-message-burn-columns";

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
  { version: 6, up: migration006 },
  { version: 7, up: migration007 },
  { version: 8, up: migration008 },
  { version: 9, up: migration009 },
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
