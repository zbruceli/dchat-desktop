import { dialog, ipcMain, shell } from "electron";
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

  ipcMain.handle(
    IPC.CHAT.SEND_IMAGE,
    async (_event, to: string, filePath: string) => {
      return await chatService.sendImageMessage(to, filePath);
    },
  );

  ipcMain.handle(
    IPC.CHAT.SEND_AUDIO,
    async (_event, to: string, audioArrayBuffer: ArrayBuffer, durationSeconds: number) => {
      return await chatService.sendAudioMessage(
        to,
        Buffer.from(audioArrayBuffer),
        durationSeconds,
      );
    },
  );

  ipcMain.handle(IPC.CHAT.PICK_IMAGE, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "webp", "bmp"] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    IPC.CHAT.DOWNLOAD_IMAGE,
    async (_event, messageId: string) => {
      await chatService.retryImageDownload(messageId);
    },
  );

  ipcMain.handle(
    IPC.CHAT.DOWNLOAD_AUDIO,
    async (_event, messageId: string) => {
      await chatService.retryAudioDownload(messageId);
    },
  );

  ipcMain.handle(IPC.CHAT.PICK_FILE, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    IPC.CHAT.SEND_FILE,
    async (_event, to: string, filePath: string) => {
      return await chatService.sendFileMessage(to, filePath);
    },
  );

  ipcMain.handle(
    IPC.CHAT.DOWNLOAD_FILE,
    async (_event, messageId: string) => {
      await chatService.retryFileDownload(messageId);
    },
  );

  ipcMain.handle(
    IPC.CHAT.OPEN_FILE,
    async (_event, localPath: string) => {
      return await shell.openPath(localPath);
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
