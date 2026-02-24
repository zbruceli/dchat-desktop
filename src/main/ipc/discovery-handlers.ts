import { ipcMain } from "electron";
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
}
