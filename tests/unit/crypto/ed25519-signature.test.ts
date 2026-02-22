import { describe, it, expect } from "vitest";
import {
  getPubKeyFromAddress,
  buildMemberRawData,
  buildGroupRawData,
  genGroupVersion,
} from "../../../src/main/crypto/ed25519-signature";

describe("ed25519-signature", () => {
  describe("getPubKeyFromAddress", () => {
    it("returns bare public key unchanged", () => {
      expect(getPubKeyFromAddress("abcdef1234567890")).toBe("abcdef1234567890");
    });

    it("extracts pubkey from id.pubkey format", () => {
      expect(getPubKeyFromAddress("id.abcdef1234567890")).toBe("abcdef1234567890");
    });

    it("extracts pubkey from multi-dot format (a.b.pubkey)", () => {
      expect(getPubKeyFromAddress("__0__.id.abcdef1234567890")).toBe("abcdef1234567890");
    });

    it("handles empty string", () => {
      expect(getPubKeyFromAddress("")).toBe("");
    });
  });

  describe("buildMemberRawData", () => {
    it("produces JSON with sorted keys", () => {
      const result = buildMemberRawData({
        permission: 10,
        groupId: "group123",
        invitee: "bob",
        inviter: "alice",
        expiresAt: 0,
      });
      const parsed = JSON.parse(result);
      const keys = Object.keys(parsed);
      expect(keys).toEqual(["expiresAt", "groupId", "invitee", "inviter", "permission"]);
    });

    it("produces deterministic output for same input", () => {
      const fields = {
        expiresAt: 1000,
        groupId: "g1",
        invitee: "bob",
        inviter: "alice",
        permission: 10,
      };
      expect(buildMemberRawData(fields)).toBe(buildMemberRawData(fields));
    });

    it("includes all fields in output", () => {
      const result = buildMemberRawData({
        expiresAt: 1000,
        groupId: "g1",
        invitee: "bob",
        inviter: "alice",
        permission: 20,
      });
      const parsed = JSON.parse(result);
      expect(parsed.expiresAt).toBe(1000);
      expect(parsed.groupId).toBe("g1");
      expect(parsed.invitee).toBe("bob");
      expect(parsed.inviter).toBe("alice");
      expect(parsed.permission).toBe(20);
    });
  });

  describe("buildGroupRawData", () => {
    it("produces JSON with sorted keys", () => {
      const result = buildGroupRawData({
        deleteAfterSeconds: 0,
        groupId: "group123",
        name: "Test",
        type: 0,
      });
      const keys = Object.keys(JSON.parse(result));
      expect(keys).toEqual(["deleteAfterSeconds", "groupId", "name", "type"]);
    });

    it("produces deterministic output", () => {
      const fields = {
        deleteAfterSeconds: 0,
        groupId: "g1",
        name: "Test Group",
        type: 0,
      };
      expect(buildGroupRawData(fields)).toBe(buildGroupRawData(fields));
    });
  });

  describe("genGroupVersion", () => {
    it("produces format {commits}.{md5hex}", () => {
      const version = genGroupVersion(1, "ownerSig", [
        { permission: 30, invitee: "owner" },
      ]);
      expect(version).toMatch(/^\d+\.[a-f0-9]{32}$/);
      expect(version.startsWith("1.")).toBe(true);
    });

    it("different commits produce different versions", () => {
      const members = [{ permission: 10, invitee: "alice" }];
      const v1 = genGroupVersion(1, "sig", members);
      const v2 = genGroupVersion(2, "sig", members);
      expect(v1).not.toBe(v2);
      expect(v1.split(".")[1]).toBe(v2.split(".")[1]); // Same MD5 hash
    });

    it("different members produce different hash", () => {
      const v1 = genGroupVersion(1, "sig", [{ permission: 10, invitee: "alice" }]);
      const v2 = genGroupVersion(1, "sig", [{ permission: 10, invitee: "bob" }]);
      expect(v1.split(".")[1]).not.toBe(v2.split(".")[1]);
    });

    it("member order does not matter (sorted internally)", () => {
      const members1 = [
        { permission: 10, invitee: "alice" },
        { permission: 20, invitee: "bob" },
      ];
      const members2 = [
        { permission: 20, invitee: "bob" },
        { permission: 10, invitee: "alice" },
      ];
      const v1 = genGroupVersion(1, "sig", members1);
      const v2 = genGroupVersion(1, "sig", members2);
      expect(v1).toBe(v2);
    });

    it("different owner signatures produce different hash", () => {
      const members = [{ permission: 10, invitee: "alice" }];
      const v1 = genGroupVersion(1, "sig-a", members);
      const v2 = genGroupVersion(1, "sig-b", members);
      expect(v1.split(".")[1]).not.toBe(v2.split(".")[1]);
    });
  });

  describe("genSignature and verifySignature", () => {
    // These require nkn-sdk and libsodium WASM — test in integration if available
    it("genSignature is a function", async () => {
      const { genSignature } = await import("../../../src/main/crypto/ed25519-signature");
      expect(typeof genSignature).toBe("function");
    });

    it("verifySignature is a function", async () => {
      const { verifySignature } = await import("../../../src/main/crypto/ed25519-signature");
      expect(typeof verifySignature).toBe("function");
    });

    it("verifySignature returns false for invalid data", async () => {
      const { verifySignature } = await import("../../../src/main/crypto/ed25519-signature");
      // Using a known-bad signature should return false
      const result = await verifySignature(
        "0".repeat(64), // fake public key
        "test data",
        "0".repeat(128), // fake signature
      );
      expect(result).toBe(false);
    });
  });

  describe("genSignature + verifySignature round-trip", () => {
    it("signs and verifies data correctly", async () => {
      let nkn: typeof import("nkn-sdk");
      try {
        nkn = await import("nkn-sdk");
      } catch {
        // Skip if nkn-sdk is not available
        return;
      }

      const { genSignature, verifySignature } = await import("../../../src/main/crypto/ed25519-signature");

      // Generate a real keypair
      const seed = "a".repeat(64);
      const kp = nkn.default.crypto.keyPair(seed);
      const publicKeyHex = Buffer.from(kp.publicKey).toString("hex");

      const rawData = "test raw data for signing";
      const signature = await genSignature(new Uint8Array(kp.privateKey), rawData);

      expect(typeof signature).toBe("string");
      expect(signature.length).toBeGreaterThan(0);

      // Verify the signature
      const isValid = await verifySignature(publicKeyHex, rawData, signature);
      expect(isValid).toBe(true);
    });

    it("verify fails with wrong public key", async () => {
      let nkn: typeof import("nkn-sdk");
      try {
        nkn = await import("nkn-sdk");
      } catch {
        return;
      }

      const { genSignature, verifySignature } = await import("../../../src/main/crypto/ed25519-signature");

      const seed = "a".repeat(64);
      const kp = nkn.default.crypto.keyPair(seed);

      const rawData = "test data";
      const signature = await genSignature(new Uint8Array(kp.privateKey), rawData);

      // Different key
      const wrongSeed = "b".repeat(64);
      const wrongKp = nkn.default.crypto.keyPair(wrongSeed);
      const wrongPubKey = Buffer.from(wrongKp.publicKey).toString("hex");

      const isValid = await verifySignature(wrongPubKey, rawData, signature);
      expect(isValid).toBe(false);
    });

    it("verify fails with tampered data", async () => {
      let nkn: typeof import("nkn-sdk");
      try {
        nkn = await import("nkn-sdk");
      } catch {
        return;
      }

      const { genSignature, verifySignature } = await import("../../../src/main/crypto/ed25519-signature");

      const seed = "a".repeat(64);
      const kp = nkn.default.crypto.keyPair(seed);
      const publicKeyHex = Buffer.from(kp.publicKey).toString("hex");

      const rawData = "original data";
      const signature = await genSignature(new Uint8Array(kp.privateKey), rawData);

      const isValid = await verifySignature(publicKeyHex, "tampered data", signature);
      expect(isValid).toBe(false);
    });
  });
});
