import { ipcMain } from "electron";
import nkn from "nkn-sdk";
import { IPC } from "../../shared/ipc-channels";
import type { BotWalletStorageService } from "../services/bot-wallet-storage-service";
import type { BotWalletInfo } from "../../shared/types/bot";

export function registerBotHandlers(
  botWalletStorage: BotWalletStorageService,
): void {
  ipcMain.handle(IPC.BOT.CREATE, async (): Promise<BotWalletInfo> => {
    const wallet = new nkn.Wallet({ password: "" });
    const seed = wallet.getSeed();
    const publicKey = wallet.getPublicKey();
    const walletAddress = wallet.address;

    botWalletStorage.save(publicKey, walletAddress, seed);

    return { publicKey, walletAddress, seed };
  });

  ipcMain.handle(IPC.BOT.GET, (): BotWalletInfo | null => {
    return botWalletStorage.load();
  });

  ipcMain.handle(IPC.BOT.DELETE, (): void => {
    botWalletStorage.clear();
  });
}
