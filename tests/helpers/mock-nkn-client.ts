import { vi } from "vitest";
import { EventEmitter } from "events";
import type { NknClientService } from "../../src/main/services/nkn-client-service";

/**
 * Shared MockNknClient for testing services that depend on NknClientService.
 * Extends EventEmitter so it can emit "message" events.
 */
export class MockNknClient extends EventEmitter {
  private status = {
    state: "connected" as const,
    address: "my.nkn.address",
    publicKey: "ab1234567890abcdef",
  };

  sendMessage = vi.fn(async () => {});
  sendMessageNoReply = vi.fn();
  sendToMultiple = vi.fn();
  subscribe = vi.fn(async () => "txn-hash-123");
  unsubscribe = vi.fn(async () => "txn-hash-456");
  getSubscribers = vi.fn(async () => [] as string[]);
  getSubscribersCount = vi.fn(async () => 0);
  getSubscription = vi.fn(async () => ({ meta: "", expiresAt: 0 }));
  getLatestBlock = vi.fn(async () => ({ height: 100000, hash: "blockhash" }));

  getStatus() {
    return { ...this.status };
  }

  getAddress(): string | undefined {
    return this.status.address;
  }

  getPublicKey(): string {
    return this.status.publicKey;
  }

  getKeyPair() {
    return { privateKey: new Uint8Array(64).fill(1) };
  }

  setConnected(address = "my.nkn.address", publicKey = "ab1234567890abcdef") {
    this.status = { state: "connected" as const, address, publicKey };
  }

  setDisconnected() {
    this.status = { state: "disconnected" as const } as typeof this.status;
  }

  simulateMessage(src: string, payload: string) {
    this.emit("message", src, payload);
  }

  /** Cast to NknClientService for type-safe injection */
  asService(): NknClientService {
    return this as unknown as NknClientService;
  }
}
