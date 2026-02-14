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

  ipcMain.handle(IPC.CLIENT_EXTRA.ECHO_TEST, async () => {
    const status = nknClient.getStatus();
    if (status.state !== "connected" || !status.address) {
      throw new Error("NKN client not connected");
    }

    const echoPayload = JSON.stringify({
      type: "echo_test",
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substring(2),
    });

    const startTime = Date.now();

    return new Promise<{ success: boolean; rtt: number; error?: string }>(
      (resolve) => {
        const timeout = setTimeout(() => {
          nknClient.removeListener("message", handler);
          resolve({ success: false, rtt: -1, error: "Echo timeout after 15s" });
        }, 15000);

        function handler(src: string, data: string) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "echo_test" && parsed.nonce === JSON.parse(echoPayload).nonce) {
              clearTimeout(timeout);
              nknClient.removeListener("message", handler);
              resolve({ success: true, rtt: Date.now() - startTime });
            }
          } catch {
            // Not our echo message, ignore
          }
        }

        nknClient.on("message", handler);

        nknClient.sendMessage(status.address!, echoPayload).catch((err) => {
          clearTimeout(timeout);
          nknClient.removeListener("message", handler);
          resolve({
            success: false,
            rtt: -1,
            error: err instanceof Error ? err.message : "Send failed",
          });
        });
      },
    );
  });
}
