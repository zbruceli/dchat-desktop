export const APP_NAME = "D-Chat Desktop";
export const APP_VERSION = "0.1.0";

export const NKN_SEED_RPC_SERVERS = [
  "http://seed.nkn.org:30003",
  "http://mainnet-seed-0001.nkn.org:30003",
  "http://mainnet-seed-0002.nkn.org:30003",
  "http://mainnet-seed-0003.nkn.org:30003",
];

export const CONNECTION_STATE = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
} as const;

export type ConnectionState = (typeof CONNECTION_STATE)[keyof typeof CONNECTION_STATE];
