import React, { useState } from "react";
import type { Message, MessageOptions } from "../../../shared/types";
import { useChatStore } from "../../stores/chat-store";
import { ImageModal } from "./ImageModal";

interface MessageBubbleProps {
  message: Message;
}

function parseOptions(message: Message): MessageOptions | null {
  if (!message.options) return null;
  try {
    return JSON.parse(message.options) as MessageOptions;
  } catch {
    return null;
  }
}

/** Check if content looks like a base64 image (not an IPFS CID) */
function isBase64Thumbnail(content: string): boolean {
  if (!content) return false;
  // IPFS CIDs start with "Qm" or "bafy"; base64 won't
  if (content.startsWith("Qm") || content.startsWith("bafy")) return false;
  // Must be reasonably long base64
  return content.length > 100;
}

/** Check if message options contain encryption keys needed for decryption */
function hasEncryptionKeys(message: Message): boolean {
  if (!message.options) return false;
  try {
    const opts = JSON.parse(message.options) as MessageOptions;
    return Array.isArray(opts.ipfsEncryptKeyBytes) && opts.ipfsEncryptKeyBytes.length > 0;
  } catch {
    return false;
  }
}

/** Build a dchat-media:// URL from a local cache file path */
function cacheUrl(localPath: string): string {
  return `dchat-media://image-cache/${localPath.split("/image-cache/").pop()}`;
}

function ImageContent({ message }: { message: Message }) {
  const [showModal, setShowModal] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const downloadImage = useChatStore((s) => s.downloadImage);

  const downloadFailed = message.localFilePath === "__download_failed__";
  const hasThumbnailFile = !!message.thumbnailLocalFilePath;

  // Full image available locally (and not the failure marker)
  if (message.localFilePath && !downloadFailed && !loadError) {
    const src = cacheUrl(message.localFilePath);
    return (
      <>
        <img
          src={src}
          alt="Image"
          className="max-w-[280px] max-h-[280px] rounded-lg cursor-pointer object-cover"
          onClick={() => setShowModal(true)}
          onError={() => setLoadError(true)}
        />
        {showModal && <ImageModal src={src} onClose={() => setShowModal(false)} />}
      </>
    );
  }

  // Outbound message that failed to send
  if (message.isOutbound && message.status === "failed") {
    return (
      <div className="w-[120px] h-[120px] bg-gray-700 rounded-lg flex items-center justify-center">
        <span className="text-xs text-red-400">Send failed</span>
      </div>
    );
  }

  // Outbound message still uploading
  if (message.isOutbound && message.status === "sending") {
    return (
      <div className="w-[120px] h-[120px] bg-gray-700 rounded-lg flex items-center justify-center">
        <span className="text-xs text-white bg-black/50 px-2 py-1 rounded">Uploading...</span>
      </div>
    );
  }

  // Download failed — show retry with thumbnail preview if available
  if (loadError || downloadFailed) {
    return (
      <div className="relative">
        {hasThumbnailFile ? (
          <img
            src={cacheUrl(message.thumbnailLocalFilePath!)}
            alt="Image thumbnail"
            className="max-w-[280px] max-h-[280px] rounded-lg blur-sm object-cover"
          />
        ) : (
          <div className="w-[120px] h-[120px] bg-gray-700 rounded-lg" />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={() => {
              setLoadError(false);
              downloadImage(message.id);
            }}
            className="text-xs text-white bg-black/60 hover:bg-black/80 px-3 py-1.5 rounded cursor-pointer transition-colors"
          >
            Tap to retry
          </button>
        </div>
      </div>
    );
  }

  // Inbound message without encryption keys — image cannot be decrypted
  if (!message.isOutbound && !hasEncryptionKeys(message)) {
    return (
      <div className="w-[120px] h-[120px] bg-gray-700 rounded-lg flex items-center justify-center">
        <span className="text-xs text-gray-400">Image unavailable</span>
      </div>
    );
  }

  // Thumbnail available but full image still downloading — show thumbnail preview
  if (hasThumbnailFile) {
    return (
      <div className="relative">
        <img
          src={cacheUrl(message.thumbnailLocalFilePath!)}
          alt="Image preview"
          className="max-w-[280px] max-h-[280px] rounded-lg object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-white bg-black/50 px-2 py-1 rounded">
            Loading full image...
          </span>
        </div>
      </div>
    );
  }

  // No thumbnail, no full image — show placeholder
  return (
    <div className="w-[120px] h-[120px] bg-gray-700 rounded-lg flex items-center justify-center">
      <span className="text-xs text-white bg-black/50 px-2 py-1 rounded">
        Downloading...
      </span>
    </div>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.isOutbound;
  const isIpfsImage = message.contentType === "ipfs";
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const statusIcon =
    message.status === "sending"
      ? "\u25CB" // circle
      : message.status === "sent"
        ? "\u2713" // check
        : message.status === "delivered"
          ? "\u2713\u2713" // double check
          : message.status === "failed"
            ? "\u2717" // x
            : "";

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"} mb-1`}>
      <div
        className={`max-w-[70%] px-3 py-2 rounded-2xl ${
          isOutbound
            ? "bg-primary-600 text-white rounded-br-md"
            : "bg-gray-800 text-gray-200 rounded-bl-md"
        }`}
      >
        {isIpfsImage ? (
          <ImageContent message={message} />
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        )}
        <div
          className={`flex items-center justify-end gap-1 mt-0.5 ${
            isOutbound ? "text-primary-200" : "text-gray-500"
          }`}
        >
          <span className="text-[10px]">{time}</span>
          {isOutbound && <span className="text-[10px]">{statusIcon}</span>}
        </div>
      </div>
    </div>
  );
}
