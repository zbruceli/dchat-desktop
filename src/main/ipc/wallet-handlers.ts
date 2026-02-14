import { ipcMain } from "electron";
import nkn from "nkn-sdk";
import { IPC } from "../../shared/ipc-channels";
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
}
