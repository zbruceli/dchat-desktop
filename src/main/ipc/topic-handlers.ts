import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import type { TopicService } from "../services/topic-service";

export function registerTopicHandlers(topicService: TopicService): void {
  ipcMain.handle(IPC.TOPIC.CREATE, (_event, topicName: string) => {
    return topicService.createAndJoin(topicName);
  });

  ipcMain.handle(IPC.TOPIC.JOIN, (_event, topicName: string) => {
    return topicService.join(topicName);
  });

  ipcMain.handle(IPC.TOPIC.LEAVE, (_event, topicName: string) => {
    return topicService.leave(topicName);
  });

  ipcMain.handle(IPC.TOPIC.LIST, () => {
    return topicService.listTopics();
  });

  ipcMain.handle(IPC.TOPIC.GET, (_event, topicName: string) => {
    return topicService.getTopic(topicName);
  });

  ipcMain.handle(IPC.TOPIC.GET_SUBSCRIBERS, (_event, topicName: string) => {
    return topicService.getSubscribers(topicName);
  });

  ipcMain.handle(IPC.TOPIC.REFRESH_SUBSCRIBERS, (_event, topicName: string) => {
    return topicService.refreshSubscribers(topicName);
  });

  ipcMain.handle(
    IPC.TOPIC.SEND_MESSAGE,
    (_event, topicName: string, content: string, contentType?: string) => {
      return topicService.sendTopicMessage(
        topicName,
        content,
        (contentType as "text") ?? "text",
      );
    },
  );

  ipcMain.handle(
    IPC.TOPIC.SEND_IMAGE,
    (_event, topicName: string, filePath: string) => {
      return topicService.sendTopicImage(topicName, filePath);
    },
  );

  ipcMain.handle(
    IPC.TOPIC.SEND_AUDIO,
    (_event, topicName: string, audioBuffer: ArrayBuffer, durationSeconds: number) => {
      return topicService.sendTopicAudio(topicName, Buffer.from(audioBuffer), durationSeconds);
    },
  );

  ipcMain.handle(
    IPC.TOPIC.SEND_FILE,
    (_event, topicName: string, filePath: string) => {
      return topicService.sendTopicFile(topicName, filePath);
    },
  );
}
