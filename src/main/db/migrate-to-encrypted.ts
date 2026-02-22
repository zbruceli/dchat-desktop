import Database from "better-sqlite3-multiple-ciphers";
import path from "path";
import fs from "fs";

/**
 * Migrates an existing unencrypted database to encrypted format.
 * If the DB is already encrypted or doesn't exist, this is a no-op.
 */
export function migrateToEncrypted(
  userDataPath: string,
  encryptionKey: string,
): void {
  const dbPath = path.join(userDataPath, "dchat.db");
  if (!fs.existsSync(dbPath)) return;

  // Check if DB is already encrypted by trying to open without a key
  let isUnencrypted = false;
  try {
    const testDb = new Database(dbPath, { readonly: true });
    // If we can read the schema, it's unencrypted
    testDb.prepare("SELECT count(*) FROM sqlite_master").get();
    isUnencrypted = true;
    testDb.close();
  } catch {
    // Can't open without key — already encrypted or corrupted
    return;
  }

  if (!isUnencrypted) return;

  // Encrypt in place using sqleet rekey
  const db = new Database(dbPath);
  try {
    db.pragma(`rekey = '${encryptionKey}'`);
  } finally {
    db.close();
  }
}
