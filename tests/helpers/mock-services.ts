import { vi } from "vitest";
import type { ImageService, ProcessResult } from "../../src/main/services/image-service";
import type { AudioService, AudioProcessResult } from "../../src/main/services/audio-service";
import type { FileService, FileProcessResult } from "../../src/main/services/file-service";
import type { IpfsService } from "../../src/main/services/ipfs-service";
import type { ContactProfileService } from "../../src/main/services/contact-profile-service";
import type { TopicService } from "../../src/main/services/topic-service";
import type { PrivateGroupService } from "../../src/main/services/private-group-service";

export function createMockImageService(overrides: Partial<ImageService> = {}): ImageService {
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

export function createMockAudioService(overrides: Partial<AudioService> = {}): AudioService {
  return {
    processAndUpload: vi.fn(async (): Promise<AudioProcessResult> => ({
      contentType: "audio",
      content: "![audio](data:audio/x-aac;base64,dGVzdA==)",
      options: {
        fileType: 2,
        fileExt: "aac",
        fileMimeType: "audio/aac",
        mediaDuration: 3.5,
      },
      localFilePath: "/cache/audio-test.aac",
    })),
    saveInlineAudio: vi.fn(() => "/cache/inline-audio.aac"),
    downloadAndDecrypt: vi.fn(async () => "/cache/downloaded.aac"),
    getCacheDir: vi.fn(() => "/cache"),
    ...overrides,
  } as unknown as AudioService;
}

export function createMockFileService(overrides: Partial<FileService> = {}): FileService {
  return {
    processAndUpload: vi.fn(async (): Promise<FileProcessResult> => ({
      content: "QmFileHash123",
      options: {
        fileType: 0,
        fileName: "test.pdf",
        fileExt: "pdf",
        fileSize: 1024,
        ipfsHash: "QmFileHash123",
        ipfsIp: "64.225.88.71",
        ipfsEncrypt: 1,
        ipfsEncryptAlgorithm: "AES/GCM/NoPadding",
        ipfsEncryptKeyBytes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
        ipfsEncryptNonceSize: 12,
      },
      localFilePath: "/cache/QmFileHash123.pdf",
    })),
    downloadAndDecrypt: vi.fn(async () => "/cache/downloaded.pdf"),
    getCacheDir: vi.fn(() => "/cache"),
    ...overrides,
  } as unknown as FileService;
}

export function createMockIpfsService(store = new Map<string, Buffer>()): IpfsService {
  return {
    setConfig: vi.fn(),
    getGateways: vi.fn(() => [{ host: "64.225.88.71", port: 80, protocol: "http:" as const }]),
    getPrimaryIp: vi.fn(() => "64.225.88.71"),
    upload: vi.fn(async (data: Buffer, _fileName: string) => {
      const hash = "Qm" + Buffer.from(data).toString("hex").slice(0, 20);
      store.set(hash, Buffer.from(data));
      return hash;
    }),
    download: vi.fn(async (hash: string) => {
      const data = store.get(hash);
      if (!data) throw new Error(`Not found: ${hash}`);
      return data;
    }),
  } as unknown as IpfsService;
}

export function createMockContactProfileService(
  overrides: Partial<ContactProfileService> = {},
): ContactProfileService {
  return {
    getMyProfileVersion: vi.fn(() => undefined),
    handleContactMessage: vi.fn(),
    checkAndRequestProfile: vi.fn(),
    ...overrides,
  } as unknown as ContactProfileService;
}

export function createMockTopicService(overrides: Partial<TopicService> = {}): TopicService {
  return {
    handleIncomingTopicControl: vi.fn(),
    handleIncomingTopicMessage: vi.fn(),
    ...overrides,
  } as unknown as TopicService;
}

export function createMockPrivateGroupService(
  overrides: Partial<PrivateGroupService> = {},
): PrivateGroupService {
  return {
    handleIncomingControlMessage: vi.fn(),
    handleIncomingGroupMessage: vi.fn(),
    ...overrides,
  } as unknown as PrivateGroupService;
}
