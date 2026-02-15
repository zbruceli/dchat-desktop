export const IPC = {
  APP: {
    GET_INFO: "app:getInfo",
  },
  CLIENT: {
    CONNECT: "client:connect",
    DISCONNECT: "client:disconnect",
    GET_STATUS: "client:getStatus",
    ON_STATUS_CHANGE: "client:onStatusChange",
  },
  CHAT: {
    SEND_MESSAGE: "chat:sendMessage",
    SEND_IMAGE: "chat:sendImage",
    PICK_IMAGE: "chat:pickImage",
    DOWNLOAD_IMAGE: "chat:downloadImage",
    GET_MESSAGES: "chat:getMessages",
    START_SESSION: "chat:startSession",
    MARK_READ: "chat:markRead",
    ON_MESSAGE: "chat:onMessage",
  },
  CONTACT: {
    ADD: "contact:add",
    LIST: "contact:list",
    GET: "contact:get",
    DELETE: "contact:delete",
  },
  WALLET: {
    CREATE: "wallet:create",
    IMPORT: "wallet:import",
    GET_BALANCE: "wallet:getBalance",
    EXPORT: "wallet:export",
    SAVE_SEED: "wallet:saveSeed",
    LOAD_SEED: "wallet:loadSeed",
    CLEAR_SEED: "wallet:clearSeed",
  },
  CLIENT_EXTRA: {
    ECHO_TEST: "client:echoTest",
  },
  SESSION: {
    LIST: "session:list",
    GET: "session:get",
    DELETE: "session:delete",
    ON_UPDATE: "session:onUpdate",
  },
  SETTINGS: {
    GET: "settings:get",
    SET: "settings:set",
  },
} as const;
