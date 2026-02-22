import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { FileService } from "../../../src/main/services/file-service";
import { createMockIpfsService } from "../../helpers/mock-services";

let tmpDir: string;
let ipfsStore: Map<string, Buffer>;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dchat-file-test-"));
  ipfsStore = new Map();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("FileService", () => {
  describe("constructor", () => {
    it("creates file-cache directory", () => {
      const ipfsService = createMockIpfsService(ipfsStore);
      new FileService(ipfsService, tmpDir);
      expect(fs.existsSync(path.join(tmpDir, "file-cache"))).toBe(true);
    });
  });

  describe("processAndUpload", () => {
    it("encrypts and uploads file, returns correct options", async () => {
      const ipfsService = createMockIpfsService(ipfsStore);
      const fileService = new FileService(ipfsService, tmpDir);

      // Create a test file
      const testFile = path.join(tmpDir, "test.pdf");
      fs.writeFileSync(testFile, Buffer.from("PDF content here"));

      const result = await fileService.processAndUpload(testFile);

      expect(result.options.fileType).toBe(0);
      expect(result.options.fileName).toBe("test.pdf");
      expect(result.options.fileExt).toBe("pdf");
      expect(result.options.fileSize).toBe(16);
      expect(result.options.ipfsHash).toBeDefined();
      expect(result.options.ipfsEncrypt).toBe(1);
      expect(result.options.ipfsEncryptAlgorithm).toBe("AES/GCM/NoPadding");
      expect(result.options.ipfsEncryptKeyBytes).toHaveLength(16);
      expect(result.options.ipfsEncryptNonceSize).toBe(12);
      expect(result.content).toBe(result.options.ipfsHash);
      expect(ipfsService.upload).toHaveBeenCalledTimes(1);
    });

    it("caches original file locally", async () => {
      const ipfsService = createMockIpfsService(ipfsStore);
      const fileService = new FileService(ipfsService, tmpDir);

      const testFile = path.join(tmpDir, "cached.txt");
      fs.writeFileSync(testFile, "cached content");

      const result = await fileService.processAndUpload(testFile);
      expect(fs.existsSync(result.localFilePath)).toBe(true);
      expect(fs.readFileSync(result.localFilePath, "utf-8")).toBe("cached content");
    });

    it("rejects files over 100MB", async () => {
      const ipfsService = createMockIpfsService(ipfsStore);
      const fileService = new FileService(ipfsService, tmpDir);

      // Create a file path but mock the read to return large buffer
      const testFile = path.join(tmpDir, "large.bin");
      // Write a small file header to make readFileSync work
      const largeBuf = Buffer.alloc(101 * 1024 * 1024); // 101 MB
      fs.writeFileSync(testFile, largeBuf);

      await expect(fileService.processAndUpload(testFile)).rejects.toThrow("File too large");
    });

    it("handles files with no extension", async () => {
      const ipfsService = createMockIpfsService(ipfsStore);
      const fileService = new FileService(ipfsService, tmpDir);

      const testFile = path.join(tmpDir, "noext");
      fs.writeFileSync(testFile, "data");

      const result = await fileService.processAndUpload(testFile);
      expect(result.options.fileExt).toBe("bin"); // Default extension
    });
  });

  describe("downloadAndDecrypt", () => {
    it("returns cached path if file exists", async () => {
      const ipfsService = createMockIpfsService(ipfsStore);
      const fileService = new FileService(ipfsService, tmpDir);

      // Pre-populate cache
      const cacheDir = path.join(tmpDir, "file-cache");
      const cachedFile = path.join(cacheDir, "QmCached.pdf");
      fs.writeFileSync(cachedFile, "cached");

      const result = await fileService.downloadAndDecrypt(
        "QmCached",
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
        12,
        "pdf",
      );
      expect(result).toBe(cachedFile);
      expect(ipfsService.download).not.toHaveBeenCalled();
    });

    it("downloads, decrypts, and caches file", async () => {
      const ipfsService = createMockIpfsService(ipfsStore);
      const fileService = new FileService(ipfsService, tmpDir);

      // First upload to get encrypted data in store
      const testFile = path.join(tmpDir, "upload.txt");
      fs.writeFileSync(testFile, "hello world");
      const uploadResult = await fileService.processAndUpload(testFile);

      // Clear local cache to force download
      const cacheDir = path.join(tmpDir, "file-cache");
      const cachedPath = path.join(cacheDir, `${uploadResult.options.ipfsHash}.txt`);
      if (fs.existsSync(cachedPath)) fs.unlinkSync(cachedPath);

      const downloadedPath = await fileService.downloadAndDecrypt(
        uploadResult.options.ipfsHash!,
        uploadResult.options.ipfsEncryptKeyBytes!,
        12,
        "txt",
      );
      expect(fs.existsSync(downloadedPath)).toBe(true);
      expect(fs.readFileSync(downloadedPath, "utf-8")).toBe("hello world");
    });

    it("throws on IPFS download failure", async () => {
      const ipfsService = createMockIpfsService(ipfsStore);
      const fileService = new FileService(ipfsService, tmpDir);

      await expect(
        fileService.downloadAndDecrypt(
          "QmNonExistent",
          [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
          12,
          "bin",
        ),
      ).rejects.toThrow();
    });

    it("passes preferredIp to IPFS download", async () => {
      const ipfsService = createMockIpfsService(ipfsStore);
      const fileService = new FileService(ipfsService, tmpDir);

      // Pre-populate store using encryptAesGcm (generates its own key)
      const { encryptAesGcm } = await import("../../../src/main/crypto/aes-gcm");
      const { ciphertext, key } = encryptAesGcm(Buffer.from("test"));
      ipfsStore.set("QmWithIp", ciphertext);

      await fileService.downloadAndDecrypt("QmWithIp", Array.from(key), 12, "txt", undefined, "1.2.3.4");
      expect(ipfsService.download).toHaveBeenCalledWith("QmWithIp", "1.2.3.4");
    });

    it("normalizes extension with leading dot", async () => {
      const ipfsService = createMockIpfsService(ipfsStore);
      const fileService = new FileService(ipfsService, tmpDir);

      // Pre-populate cache with dot-prefixed extension
      const cacheDir = path.join(tmpDir, "file-cache");
      fs.writeFileSync(path.join(cacheDir, "QmDot.pdf"), "cached");

      const result = await fileService.downloadAndDecrypt(
        "QmDot",
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
        12,
        ".pdf", // Leading dot
      );
      expect(result).toContain("QmDot.pdf");
    });
  });
});
