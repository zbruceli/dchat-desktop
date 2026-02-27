import { ipcMain, dialog } from "electron";
import { IPC } from "../../shared/ipc-channels";
import type { DiscoveryService } from "../services/discovery-service";
import type { TopicRepository } from "../db/repositories/topic-repository";

export function registerDiscoveryHandlers(
  discoveryService: DiscoveryService,
  topicRepo: TopicRepository,
): void {
  ipcMain.handle(IPC.DISCOVERY.LIST, () => {
    const joinedTopics = topicRepo.findJoined();
    const joinedNames = joinedTopics.map((t) => t.id);
    return discoveryService.getDiscoveredGroups(joinedNames);
  });

  ipcMain.handle(IPC.DISCOVERY.GET_CATEGORIES, () => {
    return discoveryService.getCategories();
  });

  ipcMain.handle(IPC.DISCOVERY.REFRESH, async () => {
    await discoveryService.refresh();
    const joinedTopics = topicRepo.findJoined();
    const joinedNames = joinedTopics.map((t) => t.id);
    return discoveryService.getDiscoveredGroups(joinedNames);
  });

  ipcMain.handle(IPC.DISCOVERY.PICK_AVATAR, async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose Group Avatar",
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "webp"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    // Read file and return base64 data URL for renderer preview
    const fs = await import("fs");
    const path = await import("path");
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace(".", "");
    const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg";
    const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
    return { filePath, dataUrl };
  });

  ipcMain.handle(
    IPC.DISCOVERY.CREATE_GROUP,
    async (_event, params: { name: string; description?: string; category?: string; avatarPath?: string }) => {
      await discoveryService.createAndBroadcastGroup(params);
    },
  );
}
