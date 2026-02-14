import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import type { ChatService } from "../services/chat-service";
import type { SendMessageParams } from "../../shared/types";

export function registerChatHandlers(chatService: ChatService): void {
  ipcMain.handle(
    IPC.CHAT.SEND_MESSAGE,
    async (_event, to: string, content: string) => {
      const params: SendMessageParams = { to, content };
      return await chatService.sendMessage(params);
    },
  );

  ipcMain.handle(IPC.CHAT.GET_MESSAGES, (_event, sessionId: string) => {
    return chatService.getMessages(sessionId);
  });

  ipcMain.handle(IPC.CHAT.START_SESSION, (_event, targetAddress: string) => {
    return chatService.startSession(targetAddress);
  });

  ipcMain.handle(IPC.CHAT.MARK_READ, (_event, sessionId: string) => {
    chatService.markSessionRead(sessionId);
  });
}
