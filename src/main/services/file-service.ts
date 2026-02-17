import fs from "fs";
import path from "path";
import { encryptAesGcm, decryptAesGcm } from "../crypto/aes-gcm";
import type { IpfsService } from "./ipfs-service";
import type { MessageOptions } from "../../shared/types/message";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export interface FileProcessResult {
  content: string; // IPFS CID
  options: MessageOptions;
  localFilePath: string;
}

export class FileService {
  private cacheDir: string;

  constructor(
    private ipfsService: IpfsService,
    userDataPath: string,
  ) {
    this.cacheDir = path.join(userDataPath, "file-cache");
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  async processAndUpload(filePath: string): Promise<FileProcessResult> {
    const fileBuffer = fs.readFileSync(filePath);

    if (fileBuffer.length > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${fileBuffer.length} bytes (max ${MAX_FILE_SIZE})`);
    }

    const fileName = path.basename(filePath);
    const fileExt = path.extname(filePath).replace(/^\./, "") || "bin";

    // Encrypt with AES-128-GCM
    const { ciphertext, key } = encryptAesGcm(fileBuffer);

    // Upload to IPFS
    const ipfsHash = await this.ipfsService.upload(ciphertext, `${fileName}.enc`);
    const primaryIp = this.ipfsService.getPrimaryIp();

    // Cache original file locally
    const localFilePath = path.join(this.cacheDir, `${ipfsHash}.${fileExt}`);
    fs.writeFileSync(localFilePath, fileBuffer);

    const options: MessageOptions = {
      fileType: 0,
      fileName,
      fileExt,
      fileSize: fileBuffer.length,
      ipfsHash,
      ipfsIp: primaryIp,
      ipfsEncrypt: 1,
      ipfsEncryptAlgorithm: "AES/GCM/NoPadding",
      ipfsEncryptKeyBytes: Array.from(key),
      ipfsEncryptNonceSize: 12,
    };

    return { content: ipfsHash, options, localFilePath };
  }

  async downloadAndDecrypt(
    ipfsHash: string,
    keyBytes: number[],
    nonceSize: number = 12,
    fileExt: string = "bin",
    fileName?: string,
    preferredIp?: string,
  ): Promise<string> {
    // Normalize extension
    const ext = fileExt.startsWith(".") ? fileExt : `.${fileExt}`;

    // Check cache first
    const cachedPath = path.join(this.cacheDir, `${ipfsHash}${ext}`);
    if (fs.existsSync(cachedPath)) {
      return cachedPath;
    }

    // Download from IPFS
    const encryptedData = await this.ipfsService.download(ipfsHash, preferredIp);

    // Convert byte array key to Buffer
    const key = Buffer.from(keyBytes);

    // Decrypt — nonce is prepended to ciphertext
    const decrypted = decryptAesGcm(encryptedData, key, nonceSize);

    // Save to cache
    fs.writeFileSync(cachedPath, decrypted);
    return cachedPath;
  }

  getCacheDir(): string {
    return this.cacheDir;
  }
}
