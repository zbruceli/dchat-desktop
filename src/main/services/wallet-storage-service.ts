import { safeStorage } from "electron";
import fs from "fs";
import path from "path";

interface WalletFile {
  keystore: string;
  walletAddress: string;
  encryptedSeed: string; // base64 of safeStorage.encryptString(seed)
}

export class WalletStorageService {
  private filePath: string;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, "wallet.json");
  }

  save(keystore: string, walletAddress: string, seed: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        "Secure storage is not available on this system. D-Chat requires OS keychain support (macOS Keychain, Windows Credential Manager, or Linux Secret Service).",
      );
    }

    const encrypted = safeStorage.encryptString(seed);
    const data: WalletFile = {
      keystore,
      walletAddress,
      encryptedSeed: encrypted.toString("base64"),
    };
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
    // Restrict file permissions to owner-only (0600)
    fs.chmodSync(this.filePath, 0o600);
  }

  load(): { keystore: string; walletAddress: string; seed: string } | null {
    if (!fs.existsSync(this.filePath)) return null;

    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        "Secure storage is not available on this system. D-Chat requires OS keychain support (macOS Keychain, Windows Credential Manager, or Linux Secret Service).",
      );
    }

    const raw = fs.readFileSync(this.filePath, "utf-8");
    const data: WalletFile = JSON.parse(raw);
    const buffer = Buffer.from(data.encryptedSeed, "base64");
    const seed = safeStorage.decryptString(buffer);

    return {
      keystore: data.keystore,
      walletAddress: data.walletAddress,
      seed,
    };
  }

  hasSavedWallet(): boolean {
    return fs.existsSync(this.filePath);
  }

  clear(): void {
    if (fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }
  }
}
