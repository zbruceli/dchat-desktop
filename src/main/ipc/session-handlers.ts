import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import type { SessionService } from "../services/session-service";
import type { ChatService } from "../services/chat-service";

export function registerSessionHandlers(
  sessionService: SessionService,
  chatService: ChatService,
): void {
  ipcMain.handle(IPC.SESSION.LIST, () => {
    return sessionService.listSessions();
  });

  ipcMain.handle(IPC.SESSION.GET, (_event, id: string) => {
    return sessionService.getSession(id);
  });

  ipcMain.handle(IPC.SESSION.DELETE, (_event, id: string) => {
    sessionService.deleteSession(id);
  });
}
