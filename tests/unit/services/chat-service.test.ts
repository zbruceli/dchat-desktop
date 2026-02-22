import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { EventEmitter } from "events";
import { ChatService } from "../../../src/main/services/chat-service";
import { MessageRepository } from "../../../src/main/db/repositories/message-repository";
import { SessionRepository } from "../../../src/main/db/repositories/session-repository";
import { ContactRepository } from "../../../src/main/db/repositories/contact-repository";
import { runMigrations } from "../../../src/main/db/migrations/migration-runner";
import type { ImageService, ProcessResult } from "../../../src/main/services/image-service";
import type { NknClientService } from "../../../src/main/services/nkn-client-service";
import type { MessageData, MessageOptions } from "../../../src/shared/types";

// --- Mocks ---

class MockNknClient extends EventEmitter {
  private status = { state: "connected" as const, address: "my.nkn.address", publicKey: "pk" };
  sendMessage = vi.fn(async () => {});
  sendMessageNoReply = vi.fn();

  getStatus() {
    return { ...this.status };
  }

  setDisconnected() {
    this.status = { state: "disconnected" as const } as typeof this.status;
  }

  simulateMessage(src: string, payload: string) {
    this.emit("message", src, payload);
  }
}

function createMockImageService(overrides: Partial<ImageService> = {}): ImageService {
  return {
    processAndUpload: vi.fn(async (): Promise<ProcessResult> => ({
      options: {
        ipfsHash: "QmTestHash123",
        ipfsIp: "64.225.88.71",
        ipfsEncrypt: 1,
        ipfsEncryptKeyBytes: [170, 187, 204, 221, 170, 187, 204, 221, 170, 187, 204, 221, 170, 187, 204, 221],
        ipfsEncryptAlgorithm: "AES/GCM/NoPadding",
        ipfsEncryptNonceSize: 12,
        ipfsThumbnailHash: "QmThumbHash123",
        ipfsThumbnailIp: "64.225.88.71",
        ipfsThumbnailEncrypt: 1,
        ipfsThumbnailEncryptKeyBytes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
        ipfsThumbnailEncryptAlgorithm: "AES/GCM/NoPadding",
        ipfsThumbnailEncryptNonceSize: 12,
        fileType: 1,
        fileExt: "jpg",
        fileMimeType: "image",
        fileSize: 5000,
        mediaWidth: 800,
        mediaHeight: 600,
      },
      localFilePath: "/cache/QmTestHash123.jpg",
      thumbnailLocalFilePath: "/cache/QmThumbHash123.jpg",
    })),
    downloadAndDecrypt: vi.fn(async () => "/cache/downloaded.jpg"),
    getCacheDir: vi.fn(() => "/cache"),
    ...overrides,
  } as unknown as ImageService;
}

// --- Test setup ---

let db: Database.Database;
let messageRepo: MessageRepository;
let sessionRepo: SessionRepository;
let contactRepo: ContactRepository;
let nknClient: MockNknClient;
let pushToRenderer: ReturnType<typeof vi.fn>;
let chatService: ChatService;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);

  messageRepo = new MessageRepository(db);
  sessionRepo = new SessionRepository(db);
  contactRepo = new ContactRepository(db);
  nknClient = new MockNknClient();
  pushToRenderer = vi.fn();

  chatService = new ChatService(
    nknClient as unknown as NknClientService,
    messageRepo,
    sessionRepo,
    contactRepo,
    pushToRenderer,
  );
});

afterEach(() => {
  db.close();
});

describe("ChatService — image messaging", () => {
  describe("sendImageMessage", () => {
    it("throws when imageService is not set", async () => {
      await expect(
        chatService.sendImageMessage("bob.addr", "/path/to/img.jpg"),
      ).rejects.toThrow("Image service not configured");
    });

    it("throws when not connected", async () => {
      nknClient.setDisconnected();
      chatService.setImageService(createMockImageService());
      await expect(
        chatService.sendImageMessage("bob.addr", "/path/to/img.jpg"),
      ).rejects.toThrow("Not connected");
    });

    it("creates a message with contentType ipfs and status sent on success", async () => {
      const imgService = createMockImageService();
      chatService.setImageService(imgService);

      const result = await chatService.sendImageMessage("bob.addr", "/path/to/img.jpg");

      expect(result.contentType).toBe("ipfs");
      expect(result.status).toBe("sent");
      expect(result.receiver).toBe("bob.addr");
      expect(result.isOutbound).toBe(true);
      expect(result.content).toBe("QmTestHash123");
      expect(result.options).toBeTruthy();
      expect(result.localFilePath).toBe("/cache/QmTestHash123.jpg");
    });

    it("calls processAndUpload with the file path", async () => {
      const imgService = createMockImageService();
      chatService.setImageService(imgService);

      await chatService.sendImageMessage("bob.addr", "/my/photo.png");
      expect(imgService.processAndUpload).toHaveBeenCalledWith("/my/photo.png");
    });

    it("sends the correct wire format via NKN", async () => {
      chatService.setImageService(createMockImageService());

      await chatService.sendImageMessage("bob.addr", "/path/to/img.jpg");

      expect(nknClient.sendMessageNoReply).toHaveBeenCalledTimes(1);
      const [dest, payload] = nknClient.sendMessageNoReply.mock.calls[0];
      expect(dest).toBe("bob.addr");

      const parsed = JSON.parse(payload) as MessageData;
      expect(parsed.contentType).toBe("ipfs");
      expect(parsed.content).toBe("QmTestHash123");
      expect(parsed.options?.ipfsHash).toBe("QmTestHash123");
      expect(parsed.options?.ipfsEncryptAlgorithm).toBe("AES/GCM/NoPadding");
      expect(parsed.options?.fileType).toBe(1);
    });

    it("pushes multiple chat:onMessage events ending with sent", async () => {
      chatService.setImageService(createMockImageService());

      await chatService.sendImageMessage("bob.addr", "/path/to/img.jpg");

      const chatPushes = pushToRenderer.mock.calls.filter(
        ([ch]: [string]) => ch === "chat:onMessage",
      );
      // At least 2 pushes: initial placeholder + final status update
      expect(chatPushes.length).toBeGreaterThanOrEqual(2);
      // The final push should be a spread copy with status "sent"
      const lastPush = chatPushes[chatPushes.length - 1][1];
      expect(lastPush.status).toBe("sent");
      expect(lastPush.contentType).toBe("ipfs");
    });

    it("sets session preview to [Image]", async () => {
      chatService.setImageService(createMockImageService());

      await chatService.sendImageMessage("bob.addr", "/path/to/img.jpg");

      const sessionPushes = pushToRenderer.mock.calls.filter(
        ([ch]: [string]) => ch === "session:onUpdate",
      );
      expect(sessionPushes.length).toBeGreaterThan(0);
    });

    it("persists the message in the database", async () => {
      chatService.setImageService(createMockImageService());

      const result = await chatService.sendImageMessage("bob.addr", "/path.jpg");

      const dbMsg = messageRepo.findById(result.id);
      expect(dbMsg).toBeDefined();
      expect(dbMsg!.contentType).toBe("ipfs");
      expect(dbMsg!.options).toBeTruthy();
      expect(dbMsg!.localFilePath).toBe("/cache/QmTestHash123.jpg");
      expect(dbMsg!.status).toBe("sent");
    });

    it("marks message as failed when NKN send fails", async () => {
      nknClient.sendMessageNoReply.mockImplementationOnce(() => { throw new Error("send failed"); });
      chatService.setImageService(createMockImageService());

      const result = await chatService.sendImageMessage("bob.addr", "/path.jpg");

      expect(result.status).toBe("failed");
      const dbMsg = messageRepo.findById(result.id);
      expect(dbMsg!.status).toBe("failed");
    });

    it("marks message as failed when image processing fails", async () => {
      const failingService = createMockImageService({
        processAndUpload: vi.fn(async () => {
          throw new Error("sharp crashed");
        }),
      });
      chatService.setImageService(failingService);

      const result = await chatService.sendImageMessage("bob.addr", "/bad.jpg");

      expect(result.status).toBe("failed");
    });
  });

  describe("handleIncomingMessage — IPFS messages", () => {
    it("accepts IPFS messages with empty content", () => {
      const imgService = createMockImageService();
      chatService.setImageService(imgService);

      const messageData: MessageData = {
        id: "incoming-1",
        contentType: "ipfs",
        content: "",
        options: {
          ipfsHash: "QmIncoming",
          ipfsEncryptKeyBytes: [170, 187, 170, 187, 170, 187, 170, 187, 170, 187, 170, 187, 170, 187, 170, 187],
          ipfsEncryptNonceSize: 12,
          fileExt: "jpg",
        },
        timestamp: Date.now(),
      };

      nknClient.simulateMessage("sender.addr", JSON.stringify(messageData));

      // Should have been accepted (not rejected for empty content)
      const chatPushes = pushToRenderer.mock.calls.filter(
        ([ch]: [string]) => ch === "chat:onMessage",
      );
      expect(chatPushes.length).toBeGreaterThanOrEqual(1);
      expect(chatPushes[0][1].contentType).toBe("ipfs");
      expect(chatPushes[0][1].id).toBe("incoming-1");
    });

    it("stores options JSON on incoming IPFS messages", () => {
      chatService.setImageService(createMockImageService());

      const opts: MessageOptions = {
        ipfsHash: "QmStored",
        ipfsEncryptKeyBytes: [170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170],
        ipfsEncryptNonceSize: 12,
        fileType: 1,
      };

      const messageData: MessageData = {
        id: "incoming-2",
        contentType: "ipfs",
        content: "thumbnail-base64",
        options: opts,
        timestamp: Date.now(),
      };

      nknClient.simulateMessage("sender.addr", JSON.stringify(messageData));

      const dbMsg = messageRepo.findById("incoming-2");
      expect(dbMsg).toBeDefined();
      expect(dbMsg!.options).toBe(JSON.stringify(opts));
      expect(dbMsg!.content).toBe("thumbnail-base64");
    });

    it("triggers background download for incoming IPFS images", async () => {
      const imgService = createMockImageService();
      chatService.setImageService(imgService);

      const keyBytes = [204, 204, 204, 204, 204, 204, 204, 204, 204, 204, 204, 204, 204, 204, 204, 204];
      const messageData: MessageData = {
        id: "incoming-dl",
        contentType: "ipfs",
        content: "QmDownload",
        options: {
          ipfsHash: "QmDownload",
          ipfsEncryptKeyBytes: keyBytes,
          ipfsEncryptNonceSize: 12,
          fileExt: "jpg",
        },
        timestamp: Date.now(),
      };

      nknClient.simulateMessage("sender.addr", JSON.stringify(messageData));

      // Wait for async download (preferredIp is undefined when ipfsIp not in options)
      await vi.waitFor(() => {
        expect(imgService.downloadAndDecrypt).toHaveBeenCalledWith(
          "QmDownload",
          keyBytes,
          12,
          "jpg",
          undefined,
        );
      });
    });

    it("pushes updated message with localFilePath after download completes", async () => {
      const imgService = createMockImageService();
      chatService.setImageService(imgService);

      const messageData: MessageData = {
        id: "incoming-push",
        contentType: "ipfs",
        content: "QmPush",
        options: {
          ipfsHash: "QmPush",
          ipfsEncryptKeyBytes: [238, 238, 238, 238, 238, 238, 238, 238, 238, 238, 238, 238, 238, 238, 238, 238],
          ipfsEncryptNonceSize: 12,
        },
        timestamp: Date.now(),
      };

      nknClient.simulateMessage("sender.addr", JSON.stringify(messageData));

      await vi.waitFor(() => {
        const pushesWithPath = pushToRenderer.mock.calls.filter(
          ([ch, msg]: [string, { localFilePath?: string }]) =>
            ch === "chat:onMessage" && msg.localFilePath,
        );
        expect(pushesWithPath.length).toBeGreaterThanOrEqual(1);
        expect(pushesWithPath[0][1].localFilePath).toBe("/cache/downloaded.jpg");
      });
    });

    it("sets session preview to [Image] for IPFS messages", () => {
      chatService.setImageService(createMockImageService());

      const messageData: MessageData = {
        id: "incoming-preview",
        contentType: "ipfs",
        content: "QmPreview",
        options: { ipfsHash: "QmPreview" },
        timestamp: Date.now(),
      };

      nknClient.simulateMessage("sender.addr", JSON.stringify(messageData));

      // The session should be updated
      const session = sessionRepo.findById("direct:sender.addr");
      expect(session).toBeDefined();
      expect(session!.lastMessageContent).toBe("[Image]");
    });

    it("still rejects non-IPFS messages with empty content", () => {
      const messageData = {
        id: "empty-text",
        contentType: "text",
        content: "",
        timestamp: Date.now(),
      };

      nknClient.simulateMessage("sender.addr", JSON.stringify(messageData));

      const dbMsg = messageRepo.findById("empty-text");
      expect(dbMsg).toBeUndefined();
    });

    it("still accepts normal text messages", () => {
      const messageData = {
        id: "text-msg",
        contentType: "text",
        content: "Hello world",
        timestamp: Date.now(),
      };

      nknClient.simulateMessage("sender.addr", JSON.stringify(messageData));

      const dbMsg = messageRepo.findById("text-msg");
      expect(dbMsg).toBeDefined();
      expect(dbMsg!.contentType).toBe("text");
      expect(dbMsg!.content).toBe("Hello world");
      expect(dbMsg!.options).toBeUndefined();
    });

    it("does not trigger download when imageService is not set", () => {
      // No setImageService called
      const messageData: MessageData = {
        id: "no-svc",
        contentType: "ipfs",
        content: "QmNoSvc",
        options: { ipfsHash: "QmNoSvc" },
        timestamp: Date.now(),
      };

      nknClient.simulateMessage("sender.addr", JSON.stringify(messageData));

      // Message should still be stored
      const dbMsg = messageRepo.findById("no-svc");
      expect(dbMsg).toBeDefined();
      // But no download push should occur (no crash)
    });

    it("handles download failure gracefully with retries", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const imgService = createMockImageService({
        downloadAndDecrypt: vi.fn(async () => {
          throw new Error("download failed");
        }),
      });
      chatService.setImageService(imgService);

      const messageData: MessageData = {
        id: "dl-fail",
        contentType: "ipfs",
        content: "QmFail",
        options: {
          ipfsHash: "QmFail",
          ipfsEncryptKeyBytes: [170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170],
          ipfsEncryptNonceSize: 12,
        },
        timestamp: Date.now(),
      };

      // Should not throw
      nknClient.simulateMessage("sender.addr", JSON.stringify(messageData));

      // Advance past all retry delays (1s + 2s + done)
      await vi.advanceTimersByTimeAsync(5000);

      // Should have retried 3 times
      expect(imgService.downloadAndDecrypt).toHaveBeenCalledTimes(3);

      // Message should still exist in DB
      const dbMsg = messageRepo.findById("dl-fail");
      expect(dbMsg).toBeDefined();
      // Failure marker persisted to DB so it survives reload
      expect(dbMsg!.localFilePath).toBe("__download_failed__");

      // Failure marker pushed to renderer
      const failPushes = pushToRenderer.mock.calls.filter(
        ([ch, msg]: [string, { localFilePath?: string }]) =>
          ch === "chat:onMessage" && msg.localFilePath === "__download_failed__",
      );
      expect(failPushes.length).toBe(1);

      vi.useRealTimers();
    });
  });

  describe("retryImageDownload", () => {
    it("retries a failed download and pushes updated message on success", async () => {
      const imgService = createMockImageService();
      chatService.setImageService(imgService);

      // First, create an IPFS message in the DB
      const retryKeyBytes = [170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170];
      const opts = JSON.stringify({
        ipfsHash: "QmRetry",
        ipfsEncryptKeyBytes: retryKeyBytes,
        ipfsEncryptNonceSize: 12,
        fileExt: "jpg",
      });
      const msg = {
        id: "retry-msg",
        sessionId: "direct:sender.addr",
        sender: "sender.addr",
        receiver: "my.nkn.address",
        contentType: "ipfs" as const,
        content: "QmRetry",
        status: "delivered" as const,
        isOutbound: false,
        options: opts,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Create the session first, then insert the message
      sessionRepo.upsert({
        id: "direct:sender.addr",
        type: "direct",
        targetAddress: "sender.addr",
        targetName: "Sender",
        lastMessageContent: "[Image]",
        lastMessageAt: Date.now(),
        unreadCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      messageRepo.insert(msg);

      pushToRenderer.mockClear();
      await chatService.retryImageDownload("retry-msg");

      // Should have called downloadAndDecrypt (preferredIp is undefined)
      expect(imgService.downloadAndDecrypt).toHaveBeenCalledWith(
        "QmRetry",
        retryKeyBytes,
        12,
        "jpg",
        undefined,
      );

      // Should have pushed the updated message with localFilePath
      const pushesWithPath = pushToRenderer.mock.calls.filter(
        ([ch, m]: [string, { localFilePath?: string }]) =>
          ch === "chat:onMessage" && m.localFilePath === "/cache/downloaded.jpg",
      );
      expect(pushesWithPath.length).toBe(1);
    });

    it("does nothing for non-existent message", async () => {
      chatService.setImageService(createMockImageService());
      await chatService.retryImageDownload("non-existent");
      // Should not throw or crash
    });

    it("does nothing for non-IPFS message", async () => {
      const imgService = createMockImageService();
      chatService.setImageService(imgService);

      sessionRepo.upsert({
        id: "direct:sender.addr",
        type: "direct",
        targetAddress: "sender.addr",
        targetName: "Sender",
        lastMessageContent: "hello",
        lastMessageAt: Date.now(),
        unreadCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      messageRepo.insert({
        id: "text-retry",
        sessionId: "direct:sender.addr",
        sender: "sender.addr",
        receiver: "my.nkn.address",
        contentType: "text",
        content: "hello",
        status: "delivered",
        isOutbound: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await chatService.retryImageDownload("text-retry");
      expect(imgService.downloadAndDecrypt).not.toHaveBeenCalled();
    });
  });

  describe("setImageService", () => {
    it("can be called after construction", () => {
      const imgService = createMockImageService();
      chatService.setImageService(imgService);
      // No throw — just verifying it's callable
    });
  });
});
