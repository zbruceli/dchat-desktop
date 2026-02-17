import React from "react";
import type { Message, MessageOptions } from "../../../shared/types";
import { useChatStore } from "../../stores/chat-store";

function parseOptions(message: Message): MessageOptions | null {
  if (!message.options) return null;
  try {
    return JSON.parse(message.options) as MessageOptions;
  } catch {
    return null;
  }
}

function formatFileSize(bytes?: number): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hasEncryptionKeys(opts: MessageOptions | null): boolean {
  return Array.isArray(opts?.ipfsEncryptKeyBytes) && opts!.ipfsEncryptKeyBytes!.length > 0;
}

function DocIcon({ className }: { className?: string }) {
  return (
    <svg className={className || "w-8 h-8"} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M13 3v5a1 1 0 001 1h5"
      />
    </svg>
  );
}

export function FileContent({ message }: { message: Message }) {
  const opts = parseOptions(message);
  const downloadFile = useChatStore((s) => s.downloadFile);
  const openFile = useChatStore((s) => s.openFile);

  const fileName = opts?.fileName || "File";
  const fileSize = formatFileSize(opts?.fileSize);
  const downloadFailed = message.localFilePath === "__download_failed__";
  const hasLocal = !!message.localFilePath && !downloadFailed;

  // Outbound sending
  if (message.isOutbound && message.status === "sending") {
    return (
      <div className="flex items-center gap-3 py-1">
        <DocIcon className="w-8 h-8 text-gray-400 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm truncate">{fileName}</p>
          <p className="text-xs text-gray-400">Uploading...</p>
        </div>
      </div>
    );
  }

  // Outbound failed
  if (message.isOutbound && message.status === "failed") {
    return (
      <div className="flex items-center gap-3 py-1">
        <DocIcon className="w-8 h-8 text-red-400 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm truncate">{fileName}</p>
          <p className="text-xs text-red-400">Send failed</p>
        </div>
      </div>
    );
  }

  // Download failed — tap to retry
  if (downloadFailed) {
    return (
      <button
        onClick={() => downloadFile(message.id)}
        className="flex items-center gap-3 py-1 cursor-pointer hover:opacity-80 transition-opacity"
      >
        <DocIcon className="w-8 h-8 text-yellow-400 flex-shrink-0" />
        <div className="min-w-0 text-left">
          <p className="text-sm truncate">{fileName}</p>
          <p className="text-xs text-yellow-400">Tap to retry</p>
        </div>
      </button>
    );
  }

  // No encryption keys — file can't be decrypted
  if (!message.isOutbound && !hasEncryptionKeys(opts)) {
    return (
      <div className="flex items-center gap-3 py-1">
        <DocIcon className="w-8 h-8 text-gray-500 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm text-gray-400">File unavailable</p>
        </div>
      </div>
    );
  }

  // Ready — has local file, click to open
  if (hasLocal) {
    return (
      <button
        onClick={() => openFile(message.localFilePath!)}
        className="flex items-center gap-3 py-1 cursor-pointer hover:opacity-80 transition-opacity"
      >
        <DocIcon className="w-8 h-8 text-blue-400 flex-shrink-0" />
        <div className="min-w-0 text-left">
          <p className="text-sm truncate">{fileName}</p>
          {fileSize && <p className="text-xs text-gray-400">{fileSize}</p>}
        </div>
      </button>
    );
  }

  // Downloading / no local file yet — tap to download
  return (
    <button
      onClick={() => downloadFile(message.id)}
      className="flex items-center gap-3 py-1 cursor-pointer hover:opacity-80 transition-opacity"
    >
      <DocIcon className="w-8 h-8 text-gray-400 flex-shrink-0" />
      <div className="min-w-0 text-left">
        <p className="text-sm truncate">{fileName}</p>
        <p className="text-xs text-gray-400">
          {fileSize ? `${fileSize} — Tap to download` : "Downloading..."}
        </p>
      </div>
    </button>
  );
}
