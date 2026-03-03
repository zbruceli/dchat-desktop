import React, { useState, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import DOMPurify from "dompurify";
import type { Message, MessageOptions, AnnouncementMessage, AnnouncementGroup } from "../../../shared/types";
import { useChatStore } from "../../stores/chat-store";
import { useContactStore } from "../../stores/contact-store";
import { usePrivateGroupStore } from "../../stores/private-group-store";
import { useTopicStore } from "../../stores/topic-store";
import { useNavStore } from "../../stores/nav-store";
import { useUserProfilePanelStore } from "../../stores/user-profile-panel-store";
import { truncateAddress, stringToColor } from "../../utils/address";
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
  // Normalize backslashes for Windows paths
  const normalized = localPath.replace(/\\/g, "/");
  return `dchat-media://image-cache/${normalized.split("/image-cache/").pop()}`;
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
        {showModal && <ImageModal src={src} localFilePath={message.localFilePath!} onClose={() => setShowModal(false)} />}
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
        <p className="text-sm">
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

function ContactOptionsContent({ message }: { message: Message }) {
  return (
    <div className="text-center py-1">
      <span className="text-[10px] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">
        {message.content}
      </span>
    </div>
  );
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds >= 86400) return `${Math.floor(totalSeconds / 86400)}d`;
  if (totalSeconds >= 3600) return `${Math.floor(totalSeconds / 3600)}h`;
  if (totalSeconds >= 60) return `${Math.floor(totalSeconds / 60)}m`;
  return `${totalSeconds}s`;
}

/** Detect if content contains HTML tags */
function containsHtml(text: string): boolean {
  return /<(?:p|div|span|a|br|h[1-6]|ul|ol|li|blockquote|img|strong|em|b|i|table|tr|td|th)\b/i.test(text);
}

/** Detect if content contains markdown syntax */
function containsMarkdown(text: string): boolean {
  // Check for common markdown patterns: headers, links, bold, italic, lists, blockquotes, code
  return /(?:^#{1,6}\s|^\s*[-*+]\s|\[.+?\]\(.+?\)|\*\*.+?\*\*|__.+?__|^\s*>|```|`[^`]+`)/m.test(text);
}

/** Open external links in the system browser */
function handleRichTextClick(e: React.MouseEvent) {
  const target = e.target as HTMLElement;
  const anchor = target.closest("a");
  if (anchor && anchor.href) {
    e.preventDefault();
    window.open(anchor.href, "_blank");
  }
}

/** Sanitize HTML and render */
function HtmlContent({ content, isOutbound }: { content: string; isOutbound: boolean }) {
  const sanitized = useMemo(() => DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ["p", "br", "a", "strong", "em", "b", "i", "u", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "code", "pre", "img", "span", "div", "table", "tr", "td", "th", "thead", "tbody"],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class"],
  }), [content]);

  return (
    <div
      className={`rich-text text-[15px] leading-relaxed break-words ${isOutbound ? "text-white" : "text-text-primary"}`}
      onClick={handleRichTextClick}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

/** Render markdown content */
function MarkdownContent({ content, isOutbound }: { content: string; isOutbound: boolean }) {
  return (
    <div className={`rich-text text-[15px] leading-relaxed break-words ${isOutbound ? "text-white" : "text-text-primary"}`} onClick={handleRichTextClick}>
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** Try to parse base64-encoded announcement message */
function parseAnnouncement(content: string): AnnouncementMessage | null {
  try {
    // Must look like base64 (long alphanumeric string)
    if (content.length < 50 || /\s/.test(content.trim())) return null;
    const decoded = atob(content.trim());
    const parsed = JSON.parse(decoded);
    if (parsed.type === "announcement" || parsed.type === "periodic") {
      return parsed as AnnouncementMessage;
    }
  } catch {
    // not an announcement
  }
  // Also try direct JSON (non-base64)
  try {
    const parsed = JSON.parse(content);
    if (parsed.type === "announcement" || parsed.type === "periodic") {
      return parsed as AnnouncementMessage;
    }
  } catch {
    // not JSON
  }
  return null;
}

function AnnouncementGroupCard({ group }: { group: AnnouncementGroup }) {
  const joinTopic = useTopicStore((s) => s.joinTopic);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const setActiveNav = useNavStore((s) => s.setActiveNav);
  const [joining, setJoining] = useState(false);

  const avatarSrc = group.avatar?.data
    ? `data:image/jpeg;base64,${group.avatar.data}`
    : null;

  const handleJoin = async () => {
    if (joining) return;
    setJoining(true);
    try {
      await joinTopic(group.topicId);
      setActiveSession(`topic:${group.topicId}`);
      setActiveNav("chat");
    } catch (err) {
      console.error("Failed to join topic:", err);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-black/20 hover:bg-black/30 transition-colors cursor-pointer"
      onClick={handleJoin}
    >
      <div className="w-9 h-9 rounded-lg bg-accent-500/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {avatarSrc ? (
          <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-accent-400 font-semibold text-xs">#</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary truncate">#{group.topicId}</p>
        {group.description && (
          <p className="text-[11px] text-text-muted truncate">{group.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {group.subscriberCount > 0 && (
          <span className="text-[10px] text-text-muted">{group.subscriberCount}</span>
        )}
        <span className="text-[10px] px-2 py-0.5 rounded bg-accent-500/30 text-accent-300">
          {joining ? "..." : "Join"}
        </span>
      </div>
    </div>
  );
}

function AnnouncementContent({ announcement }: { announcement: AnnouncementMessage }) {
  const groups = announcement.payload?.groups ?? [];
  if (groups.length === 0) return null;

  return (
    <div className="space-y-1.5 min-w-[240px]">
      <p className="text-[11px] text-text-muted font-medium uppercase tracking-wide">
        Group Discovery ({groups.length})
      </p>
      {groups.map((g) => (
        <AnnouncementGroupCard key={g.topicId} group={g} />
      ))}
    </div>
  );
}

/** Render text content with markdown/HTML detection */
function TextContent({ content, isOutbound }: { content: string; isOutbound: boolean }) {
  const hasHtml = useMemo(() => containsHtml(content), [content]);
  const hasMd = useMemo(() => containsMarkdown(content), [content]);

  if (hasHtml) return <HtmlContent content={content} isOutbound={isOutbound} />;
  if (hasMd) return <MarkdownContent content={content} isOutbound={isOutbound} />;

  return (
    <p className={`text-[15px] whitespace-pre-wrap break-words leading-relaxed ${isOutbound ? "text-white" : "text-text-primary"}`}>
      {content}
    </p>
  );
}

function BurnIndicator({ deleteAt }: { deleteAt: number }) {
  const [remaining, setRemaining] = useState(deleteAt - Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(deleteAt - Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [deleteAt]);

  if (remaining <= 0) return null;

  return (
    <span className="text-[10px] text-orange-400 flex items-center gap-0.5 min-w-[32px]" title="Burn timer">
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {formatCountdown(remaining)}
    </span>
  );
}

/** Floating action toolbar — appears on hover, Slack/Discord style */
function MessageActions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="absolute -top-4 right-2 hidden group-hover:flex items-center bg-surface-deepest border border-border-subtle rounded-lg shadow-xl z-10">
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
      >
        {copied ? (
          <>
            <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-400">Copied</span>
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span>Copy</span>
          </>
        )}
      </button>
    </div>
  );
}

/** Check if a message has copyable text content */
function isCopyableMessage(message: Message): boolean {
  const ct = message.contentType;
  return (ct === "text" || ct === "textExtension") && !!message.content;
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

  // Contact options (burn setting changes) render as centered notifications
  if (message.contentType === "contactOptions") {
    return <ContactOptionsContent message={message} />;
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
        : message.status === "delivered" || message.status === "read"
          ? "\u2713\u2713" // double check
          : message.status === "failed"
            ? "\u2717" // x
            : "";

  const senderContact = isOutbound ? undefined : contacts.find((c) => c.address === message.sender);
  const senderName = (() => {
    if (isOutbound) return "You";
    return senderContact?.name && !senderContact.name.endsWith("...")
      ? senderContact.name
      : truncateAddress(message.sender);
  })();

  const senderKey = isOutbound ? "you" : message.sender;
  const avatarColor = stringToColor(senderKey);
  const avatarInitial = senderName.charAt(0).toUpperCase();
  const senderAvatarUrl = senderContact?.avatarUri
    ? `dchat-media://contact-cache/${senderContact.avatarUri}`
    : null;

  const isInvitation = message.contentType === "privateGroup:invitation";

  // Try to detect announcement messages (base64-encoded group discovery broadcasts)
  const announcement = useMemo(() => {
    if (message.contentType !== "text" && message.contentType !== "textExtension") return null;
    return parseAnnouncement(message.content);
  }, [message.content, message.contentType]);

  const messageContent = (
    <>
      {announcement ? (
        <AnnouncementContent announcement={announcement} />
      ) : isInvitation ? (
        <InvitationContent message={message} />
      ) : isAudio || isIpfsAudio ? (
        <AudioContent message={message} />
      ) : isIpfsFile ? (
        <FileContent message={message} />
      ) : isIpfsImage ? (
        <ImageContent message={message} />
      ) : (
        <TextContent content={message.content} isOutbound={isOutbound} />
      )}
    </>
  );

  const copyable = isCopyableMessage(message) && !announcement;

  // Outbound messages: right-aligned with accent bubble, no avatar
  if (isOutbound) {
    return (
      <div className="flex justify-end px-5 py-1">
        <div className={`max-w-[70%] relative ${copyable ? "group" : ""}`}>
          {copyable && <MessageActions text={message.content} />}
          <div className="flex items-center justify-end gap-2 mb-0.5">
            {message.deleteAt && <BurnIndicator deleteAt={message.deleteAt} />}
            <span className={`text-[11px] ${message.status === "failed" ? "text-red-400" : message.status === "read" ? "text-blue-400" : "text-text-faint"}`}>
              {statusIcon}
            </span>
            <span className="text-[11px] text-text-muted">{time}</span>
          </div>
          <div className="bg-accent-600 rounded-2xl rounded-br-sm px-4 py-2 select-text">
            {messageContent}
          </div>
        </div>
      </div>
    );
  }

  const openProfile = useUserProfilePanelStore((s) => s.open);

  // Inbound messages: left-aligned with avatar
  return (
    <div className="flex justify-start px-5 py-1">
      <div className={`flex items-start gap-3 max-w-[70%] relative ${copyable ? "group" : ""}`}>
        {copyable && <MessageActions text={message.content} />}
        <div
          className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5 cursor-pointer hover:opacity-80 overflow-hidden ${senderAvatarUrl ? "" : avatarColor}`}
          onClick={() => openProfile(message.sender)}
        >
          {senderAvatarUrl ? (
            <img src={senderAvatarUrl} alt={senderName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm text-white font-medium">{avatarInitial}</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {showSender && (
              <span
                className="text-[13px] font-semibold text-text-primary cursor-pointer hover:underline"
                onClick={() => openProfile(message.sender)}
              >
                {senderName}
              </span>
            )}
            <span className="text-[11px] text-text-muted">{time}</span>
            {message.deleteAt && <BurnIndicator deleteAt={message.deleteAt} />}
          </div>
          <div className="bg-surface-raised rounded-2xl rounded-bl-sm px-4 py-2 select-text">
            {messageContent}
          </div>
        </div>
      </div>
    </div>
  );
}
