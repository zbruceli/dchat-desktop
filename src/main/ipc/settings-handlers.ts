import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import { getDatabase } from "../db/database";
import type { IpfsService } from "../services/ipfs-service";

export function registerSettingsHandlers(ipfsService?: IpfsService): void {
  ipcMain.handle(IPC.SETTINGS.GET, (_event, key: string) => {
    const db = getDatabase();
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
      | { value: string | null }
      | undefined;
    if (!row || row.value === null) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  });

  ipcMain.handle(IPC.SETTINGS.SET, (_event, key: string, value: unknown) => {
    const db = getDatabase();
    const serialized = JSON.stringify(value);
    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(key, serialized);

    // Live-update IPFS config when it changes
    if (key === "ipfs_config" && ipfsService && value) {
      try {
        ipfsService.setConfig(value as { gateways?: { host: string; port: number; protocol: "http:" | "https:" }[] });
      } catch {
        // ignore invalid config
      }
    }
  });
}
