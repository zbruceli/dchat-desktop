import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import type { NknClientService } from "../services/nkn-client-service";

export function registerClientHandlers(nknClient: NknClientService): void {
  ipcMain.handle(IPC.CLIENT.CONNECT, async (_event, seed: string) => {
    return await nknClient.connect(seed);
  });

  ipcMain.handle(IPC.CLIENT.DISCONNECT, async () => {
    await nknClient.disconnect();
  });

  ipcMain.handle(IPC.CLIENT.GET_STATUS, () => {
    return nknClient.getStatus();
  });
}
