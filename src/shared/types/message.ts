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

export interface MessageData {
  id: string;
  contentType: MessageContentType;
  content?: string;
  options?: {
    deleteAfterSeconds?: number;
  };
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
  createdAt: number;
  updatedAt: number;
}

export interface SendMessageParams {
  to: string;
  content: string;
  contentType?: MessageContentType;
}
