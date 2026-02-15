import { registerClientHandlers } from "./client-handlers";
import { registerChatHandlers } from "./chat-handlers";
import { registerContactHandlers } from "./contact-handlers";
import { registerSessionHandlers } from "./session-handlers";
import { registerWalletHandlers } from "./wallet-handlers";
import { registerSettingsHandlers } from "./settings-handlers";
import type { NknClientService } from "../services/nkn-client-service";
import type { ChatService } from "../services/chat-service";
import type { ContactService } from "../services/contact-service";
import type { SessionService } from "../services/session-service";
import type { IpfsService } from "../services/ipfs-service";

export interface RegisterHandlersParams {
  nknClient: NknClientService;
  chatService: ChatService;
  contactService: ContactService;
  sessionService: SessionService;
  ipfsService?: IpfsService;
}

export function registerAllHandlers(params: RegisterHandlersParams): void {
  registerClientHandlers(params.nknClient);
  registerChatHandlers(params.chatService);
  registerContactHandlers(params.contactService);
  registerSessionHandlers(params.sessionService, params.chatService);
  registerWalletHandlers();
  registerSettingsHandlers(params.ipfsService);
}
