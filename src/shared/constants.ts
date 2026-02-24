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

export const BURN_DURATIONS = [
  { seconds: 5, label: "5 seconds" },
  { seconds: 10, label: "10 seconds" },
  { seconds: 30, label: "30 seconds" },
  { seconds: 60, label: "1 minute" },
  { seconds: 300, label: "5 minutes" },
  { seconds: 600, label: "10 minutes" },
  { seconds: 1800, label: "30 minutes" },
  { seconds: 3600, label: "1 hour" },
  { seconds: 21600, label: "6 hours" },
  { seconds: 43200, label: "12 hours" },
  { seconds: 86400, label: "1 day" },
  { seconds: 604800, label: "1 week" },
];
