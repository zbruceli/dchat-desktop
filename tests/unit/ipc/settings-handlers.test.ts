import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../../../src/main/db/migrations/migration-runner";

// Capture registered IPC handlers
const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
  },
}));

let db: Database.Database;

vi.mock("../../../src/main/db/database", () => ({
  getDatabase: () => db,
}));

// Import after mocks are set up
import { registerSettingsHandlers } from "../../../src/main/ipc/settings-handlers";

beforeEach(() => {
  handlers.clear();
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe("settings-handlers", () => {
  it("registers settings:get and settings:set handlers", () => {
    registerSettingsHandlers();
    expect(handlers.has("settings:get")).toBe(true);
    expect(handlers.has("settings:set")).toBe(true);
  });

  describe("settings:get", () => {
    beforeEach(() => {
      registerSettingsHandlers();
    });

    it("returns null for missing key", () => {
      const handler = handlers.get("settings:get")!;
      const result = handler({}, "ipfs_config");
      expect(result).toBeNull();
    });

    it("returns parsed JSON value for existing key", () => {
      db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`).run(
        "ipfs_config",
        JSON.stringify({ gateways: [] }),
      );
      const handler = handlers.get("settings:get")!;
      const result = handler({}, "ipfs_config") as { gateways: unknown[] };
      expect(result).toEqual({ gateways: [] });
    });

    it("throws for disallowed key", () => {
      const handler = handlers.get("settings:get")!;
      expect(() => handler({}, "wallet_seed")).toThrow("not accessible");
    });

    it("returns raw string for non-JSON values", () => {
      db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`).run(
        "profile_nickname",
        "not-json",
      );
      const handler = handlers.get("settings:get")!;
      const result = handler({}, "profile_nickname");
      expect(result).toBe("not-json");
    });
  });

  describe("settings:set", () => {
    beforeEach(() => {
      registerSettingsHandlers();
    });

    it("stores value for allowed key", () => {
      const handler = handlers.get("settings:set")!;
      handler({}, "profile_nickname", "Alice");
      const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get("profile_nickname") as {
        value: string;
      };
      expect(JSON.parse(row.value)).toBe("Alice");
    });

    it("throws for disallowed key", () => {
      const handler = handlers.get("settings:set")!;
      expect(() => handler({}, "wallet_seed", "secret")).toThrow("not writable");
    });

    it("live-updates IPFS config when ipfs_config is set", () => {
      const mockIpfsService = {
        setConfig: vi.fn(),
      };
      handlers.clear();
      registerSettingsHandlers(mockIpfsService as unknown as import("../../../src/main/services/ipfs-service").IpfsService);

      const handler = handlers.get("settings:set")!;
      const config = { gateways: [{ host: "example.com", port: 80, protocol: "http:" }] };
      handler({}, "ipfs_config", config);
      expect(mockIpfsService.setConfig).toHaveBeenCalledWith(config);
    });
  });
});
