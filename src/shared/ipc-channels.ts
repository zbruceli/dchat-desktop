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
    GET_MESSAGES: "chat:getMessages",
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
