import { registerClientHandlers } from "./client-handlers";
import { registerChatHandlers } from "./chat-handlers";
import { registerContactHandlers } from "./contact-handlers";
import { registerSessionHandlers } from "./session-handlers";
import { registerWalletHandlers } from "./wallet-handlers";
import { registerSettingsHandlers } from "./settings-handlers";
import { registerTopicHandlers } from "./topic-handlers";
import { registerProfileHandlers } from "./profile-handlers";
import { registerPrivateGroupHandlers } from "./private-group-handlers";
import { registerDatabaseHandlers } from "./database-handlers";
import { registerDiscoveryHandlers } from "./discovery-handlers";
import { registerBotHandlers } from "./bot-handlers";
import type { NknClientService } from "../services/nkn-client-service";
import type { WalletStorageService } from "../services/wallet-storage-service";
import type { BotWalletStorageService } from "../services/bot-wallet-storage-service";
import type { ChatService } from "../services/chat-service";
import type { ContactService } from "../services/contact-service";
import type { SessionService } from "../services/session-service";
import type { IpfsService } from "../services/ipfs-service";
import type { TopicService } from "../services/topic-service";
import type { ProfileService } from "../services/profile-service";
import type { PrivateGroupService } from "../services/private-group-service";
import type { DiscoveryService } from "../services/discovery-service";
import type { TopicRepository } from "../db/repositories/topic-repository";

export function registerPreDbHandlers(
  nknClient: NknClientService,
  walletStorage: WalletStorageService,
  botWalletStorage: BotWalletStorageService,
  initServices: (seed: string) => void,
): void {
  registerClientHandlers(nknClient);
  registerWalletHandlers(nknClient, walletStorage, initServices);
  registerBotHandlers(botWalletStorage);
}

export interface PostDbHandlersParams {
  chatService: ChatService;
  contactService: ContactService;
  sessionService: SessionService;
  ipfsService?: IpfsService;
  topicService?: TopicService;
  profileService: ProfileService;
  privateGroupService?: PrivateGroupService;
  discoveryService?: DiscoveryService;
  topicRepo?: TopicRepository;
  walletStorage: WalletStorageService;
  userDataPath: string;
}

export function registerPostDbHandlers(
  params: PostDbHandlersParams,
  pushToRenderer: (channel: string, data: unknown) => void,
): void {
  registerChatHandlers(params.chatService);
  registerContactHandlers(params.contactService, params.chatService, pushToRenderer);
  registerSessionHandlers(params.sessionService, params.chatService, pushToRenderer);
  registerSettingsHandlers(params.ipfsService);
  if (params.topicService) {
    registerTopicHandlers(params.topicService);
  }
  if (params.privateGroupService) {
    registerPrivateGroupHandlers(params.privateGroupService);
  }
  registerProfileHandlers(params.profileService);
  if (params.discoveryService && params.topicRepo) {
    registerDiscoveryHandlers(params.discoveryService, params.topicRepo);
  }
  registerDatabaseHandlers(params.walletStorage, params.userDataPath);
}
