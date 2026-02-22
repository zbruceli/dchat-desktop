import { ipcMain } from "electron";
import nkn from "nkn-sdk";
import { IPC } from "../../shared/ipc-channels";
import type { NknClientService } from "../services/nkn-client-service";
import type { WalletStorageService } from "../services/wallet-storage-service";

export function registerWalletHandlers(
  nknClient: NknClientService,
  walletStorage: WalletStorageService,
  initServices: (seed: string) => void,
): void {
  ipcMain.handle(
    IPC.WALLET.CREATE_AND_CONNECT,
    async (_event, password: string) => {
      const wallet = new nkn.Wallet({ password });
      const seed = wallet.getSeed();
      const keystore = JSON.stringify(wallet.toJSON());
      const address = wallet.address;
      const publicKey = wallet.getPublicKey();

      walletStorage.save(keystore, address, seed);
      initServices(seed);
      await nknClient.connect(seed);

      return { address, publicKey };
    },
  );

  ipcMain.handle(
    IPC.WALLET.IMPORT_AND_CONNECT,
    async (_event, keystore: string, password: string) => {
      const wallet = await Promise.resolve(
        nkn.Wallet.fromJSON(keystore, { password }),
      );
      const seed = wallet.getSeed();
      const normalizedKeystore = JSON.stringify(wallet.toJSON());
      const address = wallet.address;
      const publicKey = wallet.getPublicKey();

      walletStorage.save(normalizedKeystore, address, seed);
      initServices(seed);
      await nknClient.connect(seed);

      return { address, publicKey };
    },
  );

  ipcMain.handle(
    IPC.WALLET.RESTORE_AND_CONNECT,
    async (_event, password: string) => {
      const saved = walletStorage.load();
      if (!saved) {
        throw new Error("No saved wallet found. Create a new one or import.");
      }

      // Verify password by decrypting keystore
      const wallet = await Promise.resolve(
        nkn.Wallet.fromJSON(saved.keystore, { password }),
      );
      const address = wallet.address;
      const publicKey = wallet.getPublicKey();

      initServices(saved.seed);
      await nknClient.connect(saved.seed);

      return { address, publicKey };
    },
  );

  ipcMain.handle(IPC.WALLET.AUTO_CONNECT, async () => {
    const saved = walletStorage.load();
    if (!saved) return null;

    initServices(saved.seed);
    await nknClient.connect(saved.seed);

    return { address: saved.walletAddress, publicKey: "" };
  });

  ipcMain.handle(IPC.WALLET.HAS_SAVED, () => {
    return walletStorage.hasSavedWallet();
  });

  ipcMain.handle(IPC.WALLET.LOGOUT, async () => {
    await nknClient.disconnect();
    walletStorage.clear();
  });

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
    IPC.WALLET.TRANSFER,
    async (
      _event,
      toAddress: string,
      amount: string,
      fee: string,
    ): Promise<{ txnHash: string }> => {
      const seed = walletStorage.loadSeedOnly();
      if (!seed) throw new Error("No wallet seed found");

      const wallet = new nkn.Wallet({ seed });

      // Validate address
      try {
        nkn.Wallet.verifyAddress(toAddress);
      } catch {
        throw new Error("Invalid NKN wallet address");
      }

      // Check balance
      const balance = await wallet.getBalance();
      const amountNum = parseFloat(amount);
      const feeNum = parseFloat(fee);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error("Amount must be greater than 0");
      }
      if (isNaN(feeNum) || feeNum < 0) {
        throw new Error("Fee must be 0 or greater");
      }
      const balanceNum = parseFloat(balance.toString());
      if (amountNum + feeNum > balanceNum) {
        throw new Error(
          `Insufficient balance. Have ${balanceNum} NKN, need ${amountNum + feeNum} NKN`,
        );
      }

      // Execute transfer
      const result = await wallet.transferTo(toAddress, amount, {
        fee,
        attrs: undefined,
        buildOnly: false,
      });
      return { txnHash: String(result) };
    },
  );

  ipcMain.handle(
    IPC.WALLET.ADDRESS_FROM_CLIENT,
    (_event, clientAddress: string): string => {
      const dotIndex = clientAddress.lastIndexOf(".");
      const publicKey =
        dotIndex >= 0 ? clientAddress.slice(dotIndex + 1) : clientAddress;
      return nkn.Wallet.publicKeyToAddress(publicKey);
    },
  );
}
