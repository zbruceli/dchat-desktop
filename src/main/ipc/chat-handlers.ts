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
}
