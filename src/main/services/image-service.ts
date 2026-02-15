import fs from "fs";
import path from "path";
import sharp from "sharp";
import { encryptAesGcm, decryptAesGcm } from "../crypto/aes-gcm";
import type { IpfsService } from "./ipfs-service";
import type { MessageOptions } from "../../shared/types/message";

const THUMBNAIL_SIZE = 120;
const THUMBNAIL_QUALITY = 40;
const MAX_DIMENSION = 2048;

export interface ProcessResult {
  options: MessageOptions;
  localFilePath: string;
  thumbnailLocalFilePath: string;
}

export class ImageService {
  private cacheDir: string;

  constructor(
    private ipfsService: IpfsService,
    userDataPath: string,
  ) {
    this.cacheDir = path.join(userDataPath, "image-cache");
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  async processAndUpload(filePath: string): Promise<ProcessResult> {
    const imageBuffer = fs.readFileSync(filePath);
    const metadata = await sharp(imageBuffer).metadata();

    // Resize if too large
    let processed = sharp(imageBuffer);
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      processed = processed.resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    const fullImageBuffer = await processed.jpeg().toBuffer();
    const fullMeta = await sharp(fullImageBuffer).metadata();

    // Generate thumbnail
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: "cover",
      })
      .jpeg({ quality: THUMBNAIL_QUALITY })
      .toBuffer();

    // Encrypt full image
    const { ciphertext: fullCiphertext, key: fullKey } = encryptAesGcm(fullImageBuffer);

    // Encrypt thumbnail (separate key, nMobile convention)
    const { ciphertext: thumbCiphertext, key: thumbKey } = encryptAesGcm(thumbnailBuffer);

    // Upload thumbnail to IPFS first (nMobile convention)
    const ipfsThumbnailHash = await this.ipfsService.upload(thumbCiphertext, "thumb.enc");

    // Upload full image to IPFS
    const ipfsHash = await this.ipfsService.upload(fullCiphertext, "image.enc");

    const primaryIp = this.ipfsService.getPrimaryIp();

    // Cache both locally
    const localFilePath = path.join(this.cacheDir, `${ipfsHash}.jpg`);
    fs.writeFileSync(localFilePath, fullImageBuffer);

    const thumbnailLocalFilePath = path.join(this.cacheDir, `${ipfsThumbnailHash}.jpg`);
    fs.writeFileSync(thumbnailLocalFilePath, thumbnailBuffer);

    // Build options in nMobile-compatible format
    const options: MessageOptions = {
      ipfsHash,
      ipfsIp: primaryIp,
      ipfsEncrypt: 1,
      ipfsEncryptAlgorithm: "AES/GCM/NoPadding",
      ipfsEncryptKeyBytes: Array.from(fullKey),
      ipfsEncryptNonceSize: 12,
      ipfsThumbnailHash,
      ipfsThumbnailIp: primaryIp,
      ipfsThumbnailEncrypt: 1,
      ipfsThumbnailEncryptAlgorithm: "AES/GCM/NoPadding",
      ipfsThumbnailEncryptKeyBytes: Array.from(thumbKey),
      ipfsThumbnailEncryptNonceSize: 12,
      fileType: 1,
      fileExt: "jpg",
      fileMimeType: "image",
      fileSize: fullImageBuffer.length,
      mediaWidth: fullMeta.width ?? width,
      mediaHeight: fullMeta.height ?? height,
    };

    return { options, localFilePath, thumbnailLocalFilePath };
  }

  /**
   * Download and decrypt an IPFS image.
   * Handles nMobile format: key as byte array, nonce prepended to ciphertext.
   */
  async downloadAndDecrypt(
    ipfsHash: string,
    keyBytes: number[],
    nonceSize: number = 12,
    fileExt: string = "jpg",
    preferredIp?: string,
  ): Promise<string> {
    // Normalize extension
    const ext = fileExt.startsWith(".") ? fileExt : `.${fileExt}`;

    // Check cache first
    const cachedPath = path.join(this.cacheDir, `${ipfsHash}${ext}`);
    if (fs.existsSync(cachedPath)) {
      return cachedPath;
    }

    // Download from IPFS (prioritize sender's gateway)
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
