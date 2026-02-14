export interface ClientStatus {
  state: "disconnected" | "connecting" | "connected";
  address?: string;
  publicKey?: string;
}
