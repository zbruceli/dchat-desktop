import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import type { PrivateGroupService } from "../services/private-group-service";

export function registerPrivateGroupHandlers(privateGroupService: PrivateGroupService): void {
  ipcMain.handle(IPC.PRIVATE_GROUP.CREATE, (_event, name: string) => {
    return privateGroupService.createGroup(name);
  });

  ipcMain.handle(IPC.PRIVATE_GROUP.LIST, () => {
    return privateGroupService.listGroups();
  });

  ipcMain.handle(IPC.PRIVATE_GROUP.GET, (_event, groupId: string) => {
    return privateGroupService.getGroup(groupId);
  });

  ipcMain.handle(IPC.PRIVATE_GROUP.INVITE, (_event, groupId: string, targetAddress: string) => {
    return privateGroupService.invite(groupId, targetAddress);
  });

  ipcMain.handle(IPC.PRIVATE_GROUP.ACCEPT, (_event, groupId: string) => {
    return privateGroupService.acceptInvitation(groupId);
  });

  ipcMain.handle(IPC.PRIVATE_GROUP.QUIT, (_event, groupId: string) => {
    return privateGroupService.quit(groupId);
  });

  ipcMain.handle(IPC.PRIVATE_GROUP.KICK, (_event, groupId: string, targetAddress: string) => {
    return privateGroupService.kickOut(groupId, targetAddress);
  });

  ipcMain.handle(IPC.PRIVATE_GROUP.GET_MEMBERS, (_event, groupId: string) => {
    return privateGroupService.getMembers(groupId);
  });

  ipcMain.handle(IPC.PRIVATE_GROUP.REFRESH_MEMBERS, (_event, groupId: string) => {
    return privateGroupService.requestMemberSync(groupId);
  });

  ipcMain.handle(
    IPC.PRIVATE_GROUP.SEND_MESSAGE,
    (_event, groupId: string, content: string, contentType?: string) => {
      return privateGroupService.sendGroupMessage(
        groupId,
        content,
        (contentType as "text") ?? "text",
      );
    },
  );

  ipcMain.handle(
    IPC.PRIVATE_GROUP.SEND_IMAGE,
    (_event, groupId: string, filePath: string) => {
      return privateGroupService.sendGroupImage(groupId, filePath);
    },
  );

  ipcMain.handle(
    IPC.PRIVATE_GROUP.SEND_AUDIO,
    (_event, groupId: string, audioBuffer: ArrayBuffer, durationSeconds: number) => {
      return privateGroupService.sendGroupAudio(groupId, Buffer.from(audioBuffer), durationSeconds);
    },
  );

  ipcMain.handle(
    IPC.PRIVATE_GROUP.SEND_FILE,
    (_event, groupId: string, filePath: string) => {
      return privateGroupService.sendGroupFile(groupId, filePath);
    },
  );
}
