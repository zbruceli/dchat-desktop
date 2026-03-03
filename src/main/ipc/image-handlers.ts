import { ipcMain, clipboard, dialog, nativeImage } from "electron";
import fs from "fs";
import path from "path";
import { IPC } from "../../shared/ipc-channels";

export function registerImageHandlers(): void {
  ipcMain.handle(
    IPC.IMAGE.COPY,
    async (_event, filePath: string): Promise<void> => {
      const image = nativeImage.createFromPath(filePath);
      if (image.isEmpty()) {
        throw new Error("Failed to load image from path");
      }
      clipboard.writeImage(image);
    },
  );

  ipcMain.handle(
    IPC.IMAGE.SAVE,
    async (_event, filePath: string): Promise<{ success: boolean; filePath?: string }> => {
      const ext = path.extname(filePath).slice(1) || "png";
      const baseName = path.basename(filePath);

      const result = await dialog.showSaveDialog({
        title: "Save Image",
        defaultPath: baseName,
        filters: [{ name: "Image", extensions: [ext] }],
      });

      if (result.canceled || !result.filePath) {
        return { success: false };
      }

      await fs.promises.copyFile(filePath, result.filePath);
      return { success: true, filePath: result.filePath };
    },
  );
}
