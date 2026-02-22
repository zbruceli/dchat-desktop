import { describe, it, expect, beforeEach, vi } from "vitest";
import { NknClientService } from "../../../src/main/services/nkn-client-service";

// Mock nkn-sdk to avoid needing real WASM/network
vi.mock("nkn-sdk", () => {
  const mockClient = {
    addr: "mock.nkn.address",
    getPublicKey: () => "mockpublickey1234",
    onConnect: (cb: () => void) => setTimeout(cb, 0),
    onMessage: vi.fn(),
    send: vi.fn(async () => {}),
    subscribe: vi.fn(async () => "txn-hash-sub"),
    unsubscribe: vi.fn(async () => "txn-hash-unsub"),
    getSubscribers: vi.fn(async () => ({ subscribers: ["addr1", "addr2"] })),
    getSubscribersCount: vi.fn(async () => 5),
    getSubscription: vi.fn(async () => ({ meta: "", expiresAt: 100000 })),
    getLatestBlock: vi.fn(async () => ({ height: 500000, hash: "blockhash" })),
    close: vi.fn(),
  };

  return {
    default: {
      MultiClient: vi.fn(() => mockClient),
      crypto: {
        keyPair: vi.fn((seed: string) => ({
          publicKey: new Uint8Array(32).fill(0xaa),
          privateKey: new Uint8Array(64).fill(0xbb),
        })),
        sign: vi.fn(async () => "mocksignature"),
      },
    },
  };
});

describe("NknClientService", () => {
  let service: NknClientService;

  beforeEach(() => {
    service = new NknClientService();
  });

  describe("initial state", () => {
    it("starts disconnected", () => {
      expect(service.getStatus().state).toBe("disconnected");
    });

    it("getAddress returns undefined when disconnected", () => {
      expect(service.getAddress()).toBeUndefined();
    });
  });

  describe("connect", () => {
    it("transitions to connected state", async () => {
      const status = await service.connect("a".repeat(64));
      expect(status.state).toBe("connected");
      expect(status.address).toBe("mock.nkn.address");
      expect(status.publicKey).toBe("mockpublickey1234");
    });

    it("emits statusChange events", async () => {
      const statuses: string[] = [];
      service.on("statusChange", (s) => statuses.push(s.state));
      await service.connect("a".repeat(64));
      expect(statuses).toContain("connecting");
      expect(statuses).toContain("connected");
    });

    it("caches the Ed25519 private key", async () => {
      await service.connect("a".repeat(64));
      const kp = service.getKeyPair();
      expect(kp.privateKey).toBeInstanceOf(Uint8Array);
      expect(kp.privateKey.length).toBe(64);
    });
  });

  describe("disconnect", () => {
    it("zeros the cached private key", async () => {
      await service.connect("a".repeat(64));
      const kp = service.getKeyPair();
      await service.disconnect();
      // The private key should be zeroed
      expect(kp.privateKey.every((b) => b === 0)).toBe(true);
    });

    it("transitions to disconnected state", async () => {
      await service.connect("a".repeat(64));
      await service.disconnect();
      expect(service.getStatus().state).toBe("disconnected");
    });
  });

  describe("sendMessage", () => {
    it("throws when disconnected", async () => {
      await expect(service.sendMessage("dest", "data")).rejects.toThrow("not connected");
    });
  });

  describe("sendMessageNoReply", () => {
    it("throws when disconnected", () => {
      expect(() => service.sendMessageNoReply("dest", "data")).toThrow("not connected");
    });
  });

  describe("sendToMultiple", () => {
    it("throws when disconnected", () => {
      expect(() => service.sendToMultiple(["a", "b"], "data")).toThrow("not connected");
    });

    it("is a no-op for empty destinations", async () => {
      await service.connect("a".repeat(64));
      // Should not throw
      service.sendToMultiple([], "data");
    });
  });

  describe("getKeyPair", () => {
    it("throws when disconnected", () => {
      expect(() => service.getKeyPair()).toThrow("not connected");
    });
  });

  describe("getPublicKey", () => {
    it("throws when disconnected", () => {
      expect(() => service.getPublicKey()).toThrow("not connected");
    });

    it("returns public key when connected", async () => {
      await service.connect("a".repeat(64));
      expect(service.getPublicKey()).toBe("mockpublickey1234");
    });
  });
});
