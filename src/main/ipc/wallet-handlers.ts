import { ipcMain, safeStorage } from "electron";
import nkn from "nkn-sdk";
import { IPC } from "../../shared/ipc-channels";
import { getDatabase } from "../db/database";
import type { WalletInfo } from "../../shared/types";

export function registerWalletHandlers(): void {
  ipcMain.handle(IPC.WALLET.CREATE, async (_event, password: string) => {
    const wallet = new nkn.Wallet({ password });
    const info: WalletInfo = {
      address: wallet.address,
      publicKey: wallet.getPublicKey(),
      seed: wallet.getSeed(),
      keystore: JSON.stringify(wallet.toJSON()),
    };
    return info;
  });

  ipcMain.handle(
    IPC.WALLET.IMPORT,
    async (_event, keystore: string, password: string) => {
      const wallet = await Promise.resolve(
        nkn.Wallet.fromJSON(keystore, { password }),
      );
      const info: WalletInfo = {
        address: wallet.address,
        publicKey: wallet.getPublicKey(),
        seed: wallet.getSeed(),
        keystore: JSON.stringify(wallet.toJSON()),
      };
      return info;
    },
  );

  ipcMain.handle(IPC.WALLET.GET_BALANCE, async (_event, address: string) => {
    const rpcAddr = "http://seed.nkn.org:30003";
    try {
      const resp = await fetch(rpcAddr, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "getbalancebyaddr",
          params: { address },
          id: 1,
        }),
      });
      const json = await resp.json();
      return json.result?.amount ?? "0";
    } catch {
      return "0";
    }
  });

  ipcMain.handle(
    IPC.WALLET.SAVE_SEED,
    (_event, seed: string, walletAddress: string) => {
      const db = getDatabase();
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(seed);
        const encoded = encrypted.toString("base64");
        db.prepare(
          `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ).run("encrypted_seed", JSON.stringify(encoded));
      } else {
        // Fallback: store seed as-is (less secure, but functional)
        db.prepare(
          `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ).run("encrypted_seed", JSON.stringify(seed));
      }
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run("wallet_address", JSON.stringify(walletAddress));
    },
  );

  ipcMain.handle(IPC.WALLET.LOAD_SEED, () => {
    const db = getDatabase();
    const seedRow = db
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .get("encrypted_seed") as { value: string } | undefined;
    const addrRow = db
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .get("wallet_address") as { value: string } | undefined;

    if (!seedRow) return null;

    let seed: string;
    const stored = JSON.parse(seedRow.value);
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(stored, "base64");
        seed = safeStorage.decryptString(buffer);
      } catch {
        // If decryption fails (e.g. stored without encryption), try as plain string
        seed = stored;
      }
    } else {
      seed = stored;
    }

    const walletAddress = addrRow ? JSON.parse(addrRow.value) : null;
    return { seed, walletAddress };
  });

  ipcMain.handle(IPC.WALLET.CLEAR_SEED, () => {
    const db = getDatabase();
    db.prepare(`DELETE FROM settings WHERE key = ?`).run("encrypted_seed");
    db.prepare(`DELETE FROM settings WHERE key = ?`).run("wallet_address");
  });
}
