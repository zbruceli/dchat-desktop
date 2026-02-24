import fs from "fs";
import path from "path";
import os from "os";
import { app } from "electron";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { decryptAesGcm } from "../crypto/aes-gcm";
import type { IpfsService } from "./ipfs-service";
import type { MessageOptions } from "../../shared/types/message";

// In packaged builds, ffmpeg is unpacked outside ASAR — fix the path
const resolvedFfmpegPath = app.isPackaged
  ? ffmpegPath.path.replace(/app\.asar([/\\])/, "app.asar.unpacked$1")
  : ffmpegPath.path;
ffmpeg.setFfmpegPath(resolvedFfmpegPath);

export interface AudioProcessResult {
  contentType: "audio";
  content: string; // base64 wrapped in nMobile data-URI
  options: MessageOptions;
  localFilePath: string;
}

// nMobile wraps inline audio as: ![audio](data:audio/x-aac;base64,<data>)
const DATA_URI_REGEX = /^!\[audio\]\(data:[^;]+;base64,(.+)\)$/s;

/**
 * Extract raw base64 from nMobile's markdown data-URI wrapper.
 * Input:  "![audio](data:audio/x-aac;base64,//FgQBD...)"
 * Output: "//FgQBD..."
 * If not wrapped, returns the input as-is (raw base64).
 */
function extractBase64(content: string): string {
  const match = content.match(DATA_URI_REGEX);
  return match ? match[1] : content;
}

/**
 * Wrap raw base64 AAC in nMobile's markdown data-URI format.
 */
function wrapBase64Aac(base64: string): string {
  return `![audio](data:audio/x-aac;base64,${base64})`;
}

export class AudioService {
  private cacheDir: string;

  constructor(
    private ipfsService: IpfsService,
    userDataPath: string,
  ) {
    this.cacheDir = path.join(userDataPath, "audio-cache");
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Convert WebM/Opus audio to AAC, then route inline or via IPFS.
   */
  async processAndUpload(
    webmBuffer: Buffer,
    durationSeconds: number,
  ): Promise<AudioProcessResult> {
    // Write WebM to temp file
    const tmpDir = os.tmpdir();
    const tmpWebm = path.join(tmpDir, `dchat-${Date.now()}.webm`);
    const tmpAac = path.join(tmpDir, `dchat-${Date.now()}.aac`);
    fs.writeFileSync(tmpWebm, webmBuffer);

    try {
      // Convert WebM → AAC (ADTS container, mono, 48kbps, 22050Hz)
      await this.convertToAac(tmpWebm, tmpAac);
      const aacBuffer = fs.readFileSync(tmpAac);

      const options: MessageOptions = {
        fileType: 2,
        fileExt: "aac",
        fileMimeType: "audio/aac",
        mediaDuration: durationSeconds,
      };

      // Always send inline: base64 encode, wrap in nMobile data-URI format
      const content = wrapBase64Aac(aacBuffer.toString("base64"));
      const localFilePath = path.join(this.cacheDir, `${Date.now()}.aac`);
      fs.writeFileSync(localFilePath, aacBuffer);

      return {
        contentType: "audio",
        content,
        options,
        localFilePath,
      };
    } finally {
      // Clean up temp files
      try {
        fs.unlinkSync(tmpWebm);
      } catch {
        /* ignore */
      }
      try {
        fs.unlinkSync(tmpAac);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Save inline audio to local cache. Handles both nMobile data-URI format
   * (![audio](data:audio/x-aac;base64,...)) and raw base64.
   * Returns the local file path.
   */
  saveInlineAudio(
    messageId: string,
    content: string,
    fileExt: string = "aac",
  ): string {
    const ext = fileExt.startsWith(".") ? fileExt : `.${fileExt}`;
    const localPath = path.join(this.cacheDir, `${messageId}${ext}`);
    const rawBase64 = extractBase64(content);
    const buffer = Buffer.from(rawBase64, "base64");
    fs.writeFileSync(localPath, buffer);
    return localPath;
  }

  /**
   * Download and decrypt an IPFS audio file. Returns the local file path.
   */
  async downloadAndDecrypt(
    ipfsHash: string,
    keyBytes: number[],
    nonceSize: number = 12,
    fileExt: string = "aac",
    preferredIp?: string,
  ): Promise<string> {
    const ext = fileExt.startsWith(".") ? fileExt : `.${fileExt}`;
    const cachedPath = path.join(this.cacheDir, `${ipfsHash}${ext}`);

    // Check cache first
    if (fs.existsSync(cachedPath)) {
      return cachedPath;
    }

    // Download from IPFS
    const encryptedData = await this.ipfsService.download(ipfsHash, preferredIp);

    // Decrypt
    const key = Buffer.from(keyBytes);
    const decrypted = decryptAesGcm(encryptedData, key, nonceSize);

    // Save to cache
    fs.writeFileSync(cachedPath, decrypted);
    return cachedPath;
  }

  getCacheDir(): string {
    return this.cacheDir;
  }

  private convertToAac(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec("aac")
        .audioBitrate("48k")
        .audioChannels(1)
        .audioFrequency(22050)
        .format("adts")
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .run();
    });
  }
}
