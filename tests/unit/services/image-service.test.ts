import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import { ImageService } from "../../../src/main/services/image-service";
import { encryptAesGcm } from "../../../src/main/crypto/aes-gcm";
import type { IpfsService } from "../../../src/main/services/ipfs-service";

function createMockIpfsService(store: Map<string, Buffer> = new Map()): IpfsService {
  return {
    setConfig: vi.fn(),
    getGateways: vi.fn(() => [{ host: "64.225.88.71", port: 80, protocol: "http:" }]),
    getPrimaryIp: vi.fn(() => "64.225.88.71"),
    upload: vi.fn(async (data: Buffer, _fileName: string) => {
      const hash = "Qm" + Buffer.from(data).subarray(0, 16).toString("hex");
      store.set(hash, data);
      return hash;
    }),
    download: vi.fn(async (ipfsHash: string) => {
      const data = store.get(ipfsHash);
      if (!data) throw new Error(`Not found: ${ipfsHash}`);
      return data;
    }),
  } as unknown as IpfsService;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dchat-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function createTestImage(width = 200, height = 200): Promise<string> {
  const filePath = path.join(tmpDir, "test-input.jpg");
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .jpeg()
    .toFile(filePath);
  return filePath;
}

describe("ImageService", () => {
  describe("constructor", () => {
    it("creates cache directory if it does not exist", () => {
      const cacheParent = path.join(tmpDir, "userdata");
      fs.mkdirSync(cacheParent, { recursive: true });
      const svc = new ImageService(createMockIpfsService(), cacheParent);
      expect(fs.existsSync(path.join(cacheParent, "image-cache"))).toBe(true);
      expect(svc.getCacheDir()).toBe(path.join(cacheParent, "image-cache"));
    });
  });

  describe("processAndUpload", () => {
    it("returns options with both full image and thumbnail IPFS hashes", async () => {
      const store = new Map<string, Buffer>();
      const ipfs = createMockIpfsService(store);
      const svc = new ImageService(ipfs, tmpDir);
      const imagePath = await createTestImage();

      const result = await svc.processAndUpload(imagePath);

      // Full image options
      expect(result.options.ipfsHash).toBeTruthy();
      expect(Array.isArray(result.options.ipfsEncryptKeyBytes)).toBe(true);
      expect(result.options.ipfsEncryptKeyBytes).toHaveLength(16);
      expect(result.options.ipfsEncryptAlgorithm).toBe("AES/GCM/NoPadding");
      expect(result.options.ipfsEncryptNonceSize).toBe(12);
      expect(result.options.ipfsIp).toBe("64.225.88.71");

      // Thumbnail options
      expect(result.options.ipfsThumbnailHash).toBeTruthy();
      expect(result.options.ipfsThumbnailHash).not.toBe(result.options.ipfsHash);
      expect(Array.isArray(result.options.ipfsThumbnailEncryptKeyBytes)).toBe(true);
      expect(result.options.ipfsThumbnailEncryptKeyBytes).toHaveLength(16);
      expect(result.options.ipfsThumbnailEncryptAlgorithm).toBe("AES/GCM/NoPadding");
      expect(result.options.ipfsThumbnailEncryptNonceSize).toBe(12);
      expect(result.options.ipfsThumbnailIp).toBe("64.225.88.71");

      // File metadata
      expect(result.options.fileType).toBe(1);
      expect(result.options.fileExt).toBe("jpg");
      expect(result.options.fileMimeType).toBe("image");
      expect(result.options.fileSize).toBeGreaterThan(0);
      expect(result.options.mediaWidth).toBeGreaterThan(0);
      expect(result.options.mediaHeight).toBeGreaterThan(0);

      // Local file paths
      expect(fs.existsSync(result.localFilePath)).toBe(true);
      expect(fs.existsSync(result.thumbnailLocalFilePath)).toBe(true);
    });

    it("caches both full image and thumbnail locally", async () => {
      const svc = new ImageService(createMockIpfsService(), tmpDir);
      const imagePath = await createTestImage();
      const result = await svc.processAndUpload(imagePath);

      const fullMeta = await sharp(fs.readFileSync(result.localFilePath)).metadata();
      expect(fullMeta.format).toBe("jpeg");

      const thumbMeta = await sharp(fs.readFileSync(result.thumbnailLocalFilePath)).metadata();
      expect(thumbMeta.format).toBe("jpeg");
      expect(thumbMeta.width).toBe(120);
      expect(thumbMeta.height).toBe(120);
    });

    it("uploads both thumbnail and full image to IPFS (2 calls)", async () => {
      const ipfs = createMockIpfsService();
      const svc = new ImageService(ipfs, tmpDir);
      const imagePath = await createTestImage();

      await svc.processAndUpload(imagePath);
      expect(ipfs.upload).toHaveBeenCalledTimes(2);
      expect(ipfs.upload).toHaveBeenCalledWith(expect.any(Buffer), "thumb.enc");
      expect(ipfs.upload).toHaveBeenCalledWith(expect.any(Buffer), "image.enc");
    });

    it("uses separate encryption keys for thumbnail and full image", async () => {
      const svc = new ImageService(createMockIpfsService(), tmpDir);
      const imagePath = await createTestImage();
      const result = await svc.processAndUpload(imagePath);

      const fullKey = result.options.ipfsEncryptKeyBytes!;
      const thumbKey = result.options.ipfsThumbnailEncryptKeyBytes!;
      // Keys should be different (randomly generated)
      expect(fullKey).not.toEqual(thumbKey);
    });

    it("encrypts uploaded data with nonce prepended", async () => {
      const store = new Map<string, Buffer>();
      const ipfs = createMockIpfsService(store);
      const svc = new ImageService(ipfs, tmpDir);
      const imagePath = await createTestImage();

      const result = await svc.processAndUpload(imagePath);
      const uploadedData = store.get(result.options.ipfsHash!);
      expect(uploadedData).toBeDefined();
      // nonce(12) + encrypted data + auth tag(16) minimum
      expect(uploadedData!.length).toBeGreaterThan(28);
    });
  });

  describe("downloadAndDecrypt", () => {
    it("returns cached path if already cached", async () => {
      const ipfs = createMockIpfsService();
      const svc = new ImageService(ipfs, tmpDir);

      const cacheDir = svc.getCacheDir();
      const cachedFile = path.join(cacheDir, "QmTestHash.jpg");
      fs.writeFileSync(cachedFile, "cached-data");

      const result = await svc.downloadAndDecrypt("QmTestHash", [0], 12, "jpg");
      expect(result).toBe(cachedFile);
      expect(ipfs.download).not.toHaveBeenCalled();
    });

    it("downloads, decrypts, and caches when not in cache", async () => {
      const plaintext = Buffer.from("decrypted image data");
      const { ciphertext, key } = encryptAesGcm(plaintext);

      const store = new Map<string, Buffer>();
      store.set("QmEncrypted", ciphertext);

      const ipfs = createMockIpfsService(store);
      const svc = new ImageService(ipfs, tmpDir);

      const keyBytes = Array.from(key);
      const result = await svc.downloadAndDecrypt("QmEncrypted", keyBytes, 12, "jpg");

      expect(fs.existsSync(result)).toBe(true);
      const content = fs.readFileSync(result);
      expect(content.toString()).toBe("decrypted image data");
      expect(ipfs.download).toHaveBeenCalledWith("QmEncrypted", undefined);
    });

    it("throws on download failure", async () => {
      const ipfs = createMockIpfsService();
      const svc = new ImageService(ipfs, tmpDir);

      await expect(
        svc.downloadAndDecrypt("QmNonExistent", [0]),
      ).rejects.toThrow("Not found");
    });

    it("normalizes file extension (adds dot if missing)", async () => {
      const plaintext = Buffer.from("png data");
      const { ciphertext, key } = encryptAesGcm(plaintext);
      const store = new Map<string, Buffer>();
      store.set("QmPng", ciphertext);

      const ipfs = createMockIpfsService(store);
      const svc = new ImageService(ipfs, tmpDir);

      const result = await svc.downloadAndDecrypt("QmPng", Array.from(key), 12, "png");
      expect(result).toContain("QmPng.png");
    });
  });
});
