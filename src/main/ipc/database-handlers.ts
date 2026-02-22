import { ipcMain, dialog, app } from "electron";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3-multiple-ciphers";
import nkn from "nkn-sdk";
import { IPC } from "../../shared/ipc-channels";
import { getDatabase, closeDatabase } from "../db/database";
import type { WalletStorageService } from "../services/wallet-storage-service";

export function registerDatabaseHandlers(
  walletStorage: WalletStorageService,
  userDataPath: string,
): void {
  ipcMain.handle(
    IPC.DATABASE.EXPORT,
    async (_event, password: string): Promise<{ success: boolean; filePath?: string }> => {
      // Verify password against saved keystore
      const saved = walletStorage.load();
      if (!saved) throw new Error("No saved wallet found");

      try {
        await Promise.resolve(nkn.Wallet.fromJSON(saved.keystore, { password }));
      } catch {
        throw new Error("Incorrect password");
      }

      // Derive backup key from password
      const backupKey = crypto.createHash("sha256").update(password).digest("hex");

      // Create temp copy via VACUUM INTO
      const tempPath = path.join(userDataPath, `dchat-backup-${Date.now()}.tmp`);
      try {
        const mainDb = getDatabase();
        mainDb.exec(`VACUUM INTO '${tempPath.replace(/'/g, "''")}'`);

        // Open temp copy with seed-derived key and rekey to password-derived key
        const seedKey = crypto.createHash("sha256").update(saved.seed, "hex").digest("hex");
        const tempDb = new Database(tempPath);
        tempDb.pragma(`key = '${seedKey}'`);
        tempDb.pragma(`rekey = '${backupKey}'`);
        tempDb.close();

        // Ask user where to save
        const result = await dialog.showSaveDialog({
          title: "Export Database Backup",
          defaultPath: "dchat-backup.db",
          filters: [{ name: "Database Backup", extensions: ["db"] }],
        });

        if (result.canceled || !result.filePath) {
          fs.unlinkSync(tempPath);
          return { success: false };
        }

        fs.copyFileSync(tempPath, result.filePath);
        fs.unlinkSync(tempPath);
        return { success: true, filePath: result.filePath };
      } catch (err) {
        // Clean up temp file on error
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        throw err;
      }
    },
  );

  ipcMain.handle(
    IPC.DATABASE.RESTORE,
    async (_event, password: string): Promise<{ success: boolean }> => {
      // Verify password against saved keystore
      const saved = walletStorage.load();
      if (!saved) throw new Error("No saved wallet found");

      try {
        await Promise.resolve(nkn.Wallet.fromJSON(saved.keystore, { password }));
      } catch {
        throw new Error("Incorrect password");
      }

      // Ask user to select backup file
      const result = await dialog.showOpenDialog({
        title: "Restore Database Backup",
        filters: [{ name: "Database Backup", extensions: ["db"] }],
        properties: ["openFile"],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false };
      }

      const backupPath = result.filePaths[0];
      const tempPath = path.join(userDataPath, `dchat-restore-${Date.now()}.tmp`);

      try {
        // Copy backup to temp (don't modify user's backup file)
        fs.copyFileSync(backupPath, tempPath);

        // Derive backup key from password
        const backupKey = crypto.createHash("sha256").update(password).digest("hex");

        // Verify the backup is a valid SQLCipher DB with this key
        const tempDb = new Database(tempPath);
        tempDb.pragma(`key = '${backupKey}'`);
        try {
          tempDb.exec("SELECT count(*) FROM sqlite_master");
        } catch {
          tempDb.close();
          throw new Error("Invalid backup file or incorrect password");
        }

        // Rekey to seed-derived key
        const seedKey = crypto.createHash("sha256").update(saved.seed, "hex").digest("hex");
        tempDb.pragma(`rekey = '${seedKey}'`);
        tempDb.close();

        // Close current database
        closeDatabase();

        // Replace dchat.db with restored backup
        const dbPath = path.join(userDataPath, "dchat.db");
        const walPath = dbPath + "-wal";
        const shmPath = dbPath + "-shm";

        // Remove WAL/SHM files
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

        // Replace main DB
        fs.copyFileSync(tempPath, dbPath);
        fs.unlinkSync(tempPath);

        // Relaunch app
        app.relaunch();
        app.exit(0);

        return { success: true };
      } catch (err) {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        throw err;
      }
    },
  );
}
