import { ipcMain, dialog } from "electron";
import { IPC } from "../../shared/ipc-channels";
import type { ProfileService } from "../services/profile-service";

export function registerProfileHandlers(profileService: ProfileService): void {
  ipcMain.handle(IPC.PROFILE.GET, () => {
    return profileService.getProfile();
  });

  ipcMain.handle(IPC.PROFILE.SET_NICKNAME, (_event, nickname: string) => {
    return profileService.setNickname(nickname);
  });

  ipcMain.handle(IPC.PROFILE.PICK_AVATAR, async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose Avatar",
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "webp"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC.PROFILE.SET_AVATAR, async (_event, filePath: string) => {
    return profileService.setAvatar(filePath);
  });
}
