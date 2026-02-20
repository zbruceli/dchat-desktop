import React, { useState } from "react";
import type { Message, MessageOptions } from "../../../shared/types";
import { useChatStore } from "../../stores/chat-store";
import { useContactStore } from "../../stores/contact-store";
import { usePrivateGroupStore } from "../../stores/private-group-store";
import { ImageModal } from "./ImageModal";
import { AudioContent } from "./AudioContent";
import { FileContent } from "./FileContent";

interface MessageBubbleProps {
  message: Message;
  showSender?: boolean;
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
          className="max-w-[400px] max-h-[300px] rounded-lg cursor-pointer object-cover"
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
      <div className="w-[120px] h-[120px] bg-surface-raised rounded-lg flex items-center justify-center">
        <span className="text-xs text-red-400">Send failed</span>
      </div>
    );
  }

  // Outbound message still uploading
  if (message.isOutbound && message.status === "sending") {
    return (
      <div className="w-[120px] h-[120px] bg-surface-raised rounded-lg flex items-center justify-center">
        <span className="text-xs text-text-muted bg-black/50 px-2 py-1 rounded">Uploading...</span>
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
            className="max-w-[400px] max-h-[300px] rounded-lg blur-sm object-cover"
          />
        ) : (
          <div className="w-[120px] h-[120px] bg-surface-raised rounded-lg" />
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
      <div className="w-[120px] h-[120px] bg-surface-raised rounded-lg flex items-center justify-center">
        <span className="text-xs text-text-muted">Image unavailable</span>
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
          className="max-w-[400px] max-h-[300px] rounded-lg object-cover"
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
    <div className="w-[120px] h-[120px] bg-surface-raised rounded-lg flex items-center justify-center">
      <span className="text-xs text-text-muted bg-black/50 px-2 py-1 rounded">
        Downloading...
      </span>
    </div>
  );
}

function InvitationContent({ message }: { message: Message }) {
  const acceptInvitation = usePrivateGroupStore((s) => s.acceptInvitation);
  const groups = usePrivateGroupStore((s) => s.groups);
  const [accepting, setAccepting] = useState(false);

  let groupName = "Unknown Group";
  let groupId = "";
  try {
    const payload = JSON.parse(message.content);
    // nMobile uses "name", D-Chat legacy uses "groupName"
    groupName = payload.name || payload.groupName || groupName;
    groupId = payload.groupId || "";
  } catch {
    // ignore
  }

  const group = groups.find((g) => g.groupId === groupId);
  const alreadyJoined = group?.joined === true;

  async function handleAccept() {
    if (!groupId) return;
    setAccepting(true);
    try {
      await acceptInvitation(groupId);
    } catch (err) {
      console.error("Failed to accept invitation:", err);
    } finally {
      setAccepting(false);
    }
  }

  // Outbound: sender sees "Invited X to join GroupName"
  if (message.isOutbound) {
    let inviteeName = "";
    try {
      const p = JSON.parse(message.content);
      inviteeName = p.invitee ? truncateAddress(p.invitee) : "";
    } catch { /* ignore */ }
    return (
      <div className="space-y-1">
        <p className="text-sm text-text-primary">
          Invited {inviteeName ? <span className="font-medium">{inviteeName}</span> : "someone"} to join{" "}
          <span className="font-semibold">{groupName}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-text-primary">
        Invited you to join <span className="font-semibold">{groupName}</span>
      </p>
      {!alreadyJoined && (
        <button
          onClick={handleAccept}
          disabled={accepting}
          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs rounded transition-colors"
        >
          {accepting ? "Accepting..." : "Accept"}
        </button>
      )}
      {alreadyJoined && (
        <span className="text-xs text-emerald-400">Joined</span>
      )}
    </div>
  );
}

function ControlMessageContent({ message }: { message: Message }) {
  return (
    <div className="text-center py-1">
      <span className="text-[10px] text-text-muted bg-surface-raised/50 px-2 py-0.5 rounded">
        {message.content}
      </span>
    </div>
  );
}

/** Truncate an NKN address for display */
function truncateAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return addr.substring(0, 8) + "..." + addr.substring(addr.length - 6);
}

/** Generate a consistent color from a string (for avatar backgrounds) */
function stringToColor(str: string): string {
  const colors = [
    "bg-blue-700", "bg-emerald-700", "bg-purple-700", "bg-amber-700",
    "bg-rose-700", "bg-cyan-700", "bg-indigo-700", "bg-teal-700",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function MessageBubble({ message, showSender }: MessageBubbleProps) {
  const isOutbound = message.isOutbound;
  const contacts = useContactStore((s) => s.contacts);
  const opts = parseOptions(message);

  // Private group control messages render as centered notifications
  const isControlMessage =
    message.contentType === "privateGroup:subscribe" ||
    message.contentType === "privateGroup:quit";

  if (isControlMessage) {
    return <ControlMessageContent message={message} />;
  }

  const isAudio = message.contentType === "audio";
  const isIpfsAudio =
    message.contentType === "ipfs" &&
    (opts?.fileType === 2 || opts?.fileType === "2");
  const isIpfsImage =
    message.contentType === "ipfs" &&
    !isIpfsAudio &&
    (opts?.fileType === 1 || opts?.fileType === "1" || opts?.fileType === undefined);
  const isIpfsFile =
    message.contentType === "ipfs" && !isIpfsAudio && !isIpfsImage;
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

  const senderName = (() => {
    if (isOutbound) return "You";
    const contact = contacts.find((c) => c.address === message.sender);
    return contact?.name && !contact.name.endsWith("...")
      ? contact.name
      : truncateAddress(message.sender);
  })();

  const senderKey = isOutbound ? "you" : message.sender;
  const avatarColor = stringToColor(senderKey);
  const avatarInitial = senderName.charAt(0).toUpperCase();

  // Private group invitation renders specially
  if (message.contentType === "privateGroup:invitation") {
    return (
      <div className="group flex items-start gap-3 px-5 py-1 hover:bg-surface-hover/50 transition-colors">
        <div className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5 ${avatarColor}`}>
          <span className="text-sm text-white font-medium">{avatarInitial}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold text-text-primary">{senderName}</span>
            <span className="text-[11px] text-text-muted">{time}</span>
            {isOutbound && (
              <span className={`text-[11px] ${message.status === "failed" ? "text-red-400" : "text-text-faint"}`}>
                {statusIcon}
              </span>
            )}
          </div>
          <div className="mt-0.5">
            <InvitationContent message={message} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3 px-5 py-1 hover:bg-surface-hover/50 transition-colors">
      {/* Avatar */}
      <div className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5 ${avatarColor}`}>
        <span className="text-sm text-white font-medium">{avatarInitial}</span>
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-text-primary">{senderName}</span>
          <span className="text-[11px] text-text-muted">{time}</span>
          {isOutbound && (
            <span className={`text-[11px] ${message.status === "failed" ? "text-red-400" : "text-text-faint"}`}>
              {statusIcon}
            </span>
          )}
        </div>
        <div className="mt-0.5">
          {isAudio || isIpfsAudio ? (
            <AudioContent message={message} />
          ) : isIpfsFile ? (
            <FileContent message={message} />
          ) : isIpfsImage ? (
            <ImageContent message={message} />
          ) : (
            <p className="text-[15px] text-text-primary whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
          )}
        </div>
      </div>
    </div>
  );
}
