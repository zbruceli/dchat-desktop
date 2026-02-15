export type MessageContentType =
  | "text"
  | "textExtension"
  | "image"
  | "audio"
  | "video"
  | "file"
  | "ipfs"
  | "piece"
  | "receipt"
  | "contact"
  | "contactOptions"
  | "deviceInfo"
  | "deviceRequest";

export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface MessageOptions {
  deleteAfterSeconds?: number;
  profileVersion?: string;

  // Full image IPFS (nMobile format)
  ipfsHash?: string;
  ipfsIp?: string;
  ipfsEncrypt?: number;
  ipfsEncryptAlgorithm?: string; // "AES/GCM/NoPadding"
  ipfsEncryptKeyBytes?: number[]; // byte array (nMobile sends [176,113,...])
  ipfsEncryptNonceSize?: number; // 12 — nonce is prepended to ciphertext

  // Thumbnail IPFS (nMobile format)
  ipfsThumbnailHash?: string;
  ipfsThumbnailIp?: string;
  ipfsThumbnailEncrypt?: number;
  ipfsThumbnailEncryptAlgorithm?: string;
  ipfsThumbnailEncryptKeyBytes?: number[];
  ipfsThumbnailEncryptNonceSize?: number;

  // File info
  fileType?: number | string; // nMobile sends 1 for image
  fileExt?: string; // "png" or ".jpg"
  fileMimeType?: string;
  fileSize?: number;
  mediaWidth?: number;
  mediaHeight?: number;
}

export interface MessageData {
  id: string;
  contentType: MessageContentType;
  content?: string;
  options?: MessageOptions;
  timestamp: number;
}

export interface Message {
  id: string;
  sessionId: string;
  sender: string;
  receiver: string;
  contentType: MessageContentType;
  content: string;
  status: MessageStatus;
  isOutbound: boolean;
  nknMessageId?: string;
  options?: string; // JSON-serialized MessageOptions
  localFilePath?: string;
  thumbnailLocalFilePath?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SendMessageParams {
  to: string;
  content: string;
  contentType?: MessageContentType;
}

export interface SendImageParams {
  to: string;
  filePath: string;
}
