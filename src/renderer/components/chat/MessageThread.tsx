import React, { useEffect, useRef, useState } from "react";
import { useChatStore } from "../../stores/chat-store";
import { useSessionStore } from "../../stores/session-store";
import { useTopicStore } from "../../stores/topic-store";
import { usePrivateGroupStore } from "../../stores/private-group-store";
import { useContactStore } from "../../stores/contact-store";
import { useClientStore } from "../../stores/client-store";
import { useProfileStore } from "../../stores/profile-store";
import { useUserProfilePanelStore } from "../../stores/user-profile-panel-store";
import { truncateAddress } from "../../utils/address";
import type { Message, TopicSubscriber } from "../../../shared/types";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { PrivateGroupMemberPanel } from "./PrivateGroupMemberPanel";
import { ContactEditPanel } from "../contact/ContactEditPanel";

function SubscriberPanel({
  topicName,
  onClose,
}: {
  topicName: string;
  onClose: () => void;
}) {
  const [subscribers, setSubscribers] = useState<TopicSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const contacts = useContactStore((s) => s.contacts);
  const myAddress = useClientStore((s) => s.status?.address);
  const myNickname = useProfileStore((s) => s.profile?.nickname);
  const openProfile = useUserProfilePanelStore((s) => s.open);

  useEffect(() => {
    loadSubscribers();
  }, [topicName]);

  async function loadSubscribers() {
    setLoading(true);
    try {
      const subs = await window.dchat.topic.getSubscribers(topicName);
      setSubscribers(subs);
    } catch (err) {
      console.error("Failed to load subscribers:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await window.dchat.topic.refreshSubscribers(topicName);
      const subs = await window.dchat.topic.getSubscribers(topicName);
      setSubscribers(subs);
    } catch (err) {
      console.error("Failed to refresh subscribers:", err);
    } finally {
      setRefreshing(false);
    }
  }

  function getDisplayName(address: string): string {
    if (address === myAddress && myNickname) {
      return myNickname;
    }
    const contact = contacts.find((c) => c.address === address);
    if (contact && contact.name && !contact.name.endsWith("...")) {
      return contact.name;
    }
    return truncateAddress(address, 10, 8);
  }

  return (
    <div className="w-56 border-l border-surface-border flex flex-col min-h-0 bg-surface-deep">
      <div className="px-3 py-2.5 border-b border-surface-border flex items-center justify-between">
        <span className="text-xs font-semibold text-text-secondary">
          Members ({subscribers.length})
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors disabled:opacity-40"
            title="Refresh from blockchain"
          >
            <svg
              className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors"
            title="Close"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-text-muted">Loading...</span>
          </div>
        ) : subscribers.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-text-muted">No subscribers yet</span>
          </div>
        ) : (
          <div className="py-1">
            {subscribers.map((sub) => {
              const subContact = contacts.find((c) => c.address === sub.contactAddress);
              const subAvatarUrl = subContact?.avatarUri
                ? `dchat-media://contact-cache/${subContact.avatarUri}`
                : null;
              return (
              <div
                key={sub.contactAddress}
                className="px-3 py-1.5 flex items-center gap-2 hover:bg-surface-hover/50 cursor-pointer"
                onClick={() => openProfile(sub.contactAddress, { topicName })}
              >
                <div className="w-6 h-6 rounded-lg bg-surface-hover flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {subAvatarUrl ? (
                    <img src={subAvatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] text-text-secondary">
                      {sub.contactAddress.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="text-xs text-text-secondary truncate" title={sub.contactAddress}>
                  {getDisplayName(sub.contactAddress)}
                </span>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MessagesContainer({ messages, isTopic }: { messages: Message[]; isTopic: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef<number>(0);

  // Smooth scroll when new messages arrive (column-reverse handles initial position)
  useEffect(() => {
    if (prevCountRef.current > 0 && messages.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto py-2 flex flex-col-reverse">
      <div>
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-text-muted">
              {isTopic ? "No messages yet in this topic." : "No messages yet. Say hello!"}
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} showSender={true} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export function MessageThread() {
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const messagesBySession = useChatStore((s) => s.messagesBySession);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendImage = useChatStore((s) => s.sendImage);
  const sendTopicImage = useChatStore((s) => s.sendTopicImage);
  const sendAudio = useChatStore((s) => s.sendAudio);
  const sendTopicAudio = useChatStore((s) => s.sendTopicAudio);
  const sendFile = useChatStore((s) => s.sendFile);
  const sendTopicFile = useChatStore((s) => s.sendTopicFile);
  const sendPrivateGroupImage = useChatStore((s) => s.sendPrivateGroupImage);
  const sendPrivateGroupAudio = useChatStore((s) => s.sendPrivateGroupAudio);
  const sendPrivateGroupFile = useChatStore((s) => s.sendPrivateGroupFile);
  const sessions = useSessionStore((s) => s.sessions);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const topics = useTopicStore((s) => s.topics);
  const leaveTopic = useTopicStore((s) => s.leaveTopic);
  const groups = usePrivateGroupStore((s) => s.groups);
  const quitGroup = usePrivateGroupStore((s) => s.quitGroup);
  const contacts = useContactStore((s) => s.contacts);

  const [leaving, setLeaving] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showContactPanel, setShowContactPanel] = useState(false);

  const messages = activeSessionId ? messagesBySession[activeSessionId] ?? [] : [];
  const session = sessions.find((s) => s.id === activeSessionId);
  const isTopic = session?.type === "topic";
  const isPrivateGroup = session?.type === "privateGroup";
  const isGroup = isTopic || isPrivateGroup;
  const topicName = isTopic ? session.targetAddress : null;
  const topic = topicName ? topics.find((t) => t.id === topicName) : null;
  const groupId = isPrivateGroup ? session.targetAddress : null;
  const group = groupId ? groups.find((g) => g.groupId === groupId) : null;
  const isDirect = session && !isTopic && !isPrivateGroup;
  const directContact = isDirect ? contacts.find((c) => c.address === session.targetAddress) : undefined;
  const displayName = (isDirect
    ? (directContact?.name || session.targetName)
    : session?.targetName) || "";
  const headerAvatarUrl = directContact?.avatarUri
    ? `dchat-media://contact-cache/${directContact.avatarUri}`
    : null;

  // Close panels when switching sessions
  useEffect(() => {
    if (!isGroup) setShowMembers(false);
    setShowContactPanel(false);
  }, [activeSessionId, isGroup]);


  if (!activeSessionId || !session) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-base">
        <p className="text-sm text-text-muted">Select a conversation to start messaging</p>
      </div>
    );
  }

  function handleSend(content: string) {
    if (!session) return;
    if (isTopic && topicName) {
      window.dchat.topic.sendMessage(topicName, content).catch(console.error);
    } else if (isPrivateGroup && groupId) {
      window.dchat.privateGroup.sendMessage(groupId, content).catch(console.error);
    } else {
      sendMessage(session.targetAddress, content);
    }
  }

  function handleSendImage() {
    if (session && isTopic && topicName) {
      sendTopicImage(topicName);
    } else if (session && isPrivateGroup && groupId) {
      sendPrivateGroupImage(groupId);
    } else if (session && !isGroup) {
      sendImage(session.targetAddress);
    }
  }

  function handleSendAudio(audioBuffer: ArrayBuffer, durationSeconds: number) {
    if (session && isTopic && topicName) {
      sendTopicAudio(topicName, audioBuffer, durationSeconds);
    } else if (session && isPrivateGroup && groupId) {
      sendPrivateGroupAudio(groupId, audioBuffer, durationSeconds);
    } else if (session && !isGroup) {
      sendAudio(session.targetAddress, audioBuffer, durationSeconds);
    }
  }

  function handleSendFile() {
    if (session && isTopic && topicName) {
      sendTopicFile(topicName);
    } else if (session && isPrivateGroup && groupId) {
      sendPrivateGroupFile(groupId);
    } else if (session && !isGroup) {
      sendFile(session.targetAddress);
    }
  }

  async function handleLeaveTopic() {
    if (!topicName) return;
    setLeaving(true);
    try {
      await leaveTopic(topicName);
      await loadSessions();
      useChatStore.getState().setActiveSession(null);
    } catch (err) {
      console.error("Failed to leave topic:", err);
    } finally {
      setLeaving(false);
    }
  }

  async function handleLeaveGroup() {
    if (!groupId) return;
    setLeaving(true);
    try {
      await quitGroup(groupId);
      await loadSessions();
      useChatStore.getState().setActiveSession(null);
    } catch (err) {
      console.error("Failed to leave group:", err);
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-surface-base">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-surface-border">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden ${
              isTopic ? "bg-accent-700/30" : isPrivateGroup ? "bg-emerald-700/30" : "bg-surface-hover"
            } ${isDirect ? "cursor-pointer hover:opacity-80" : ""}`}
            onClick={isDirect ? () => setShowContactPanel(!showContactPanel) : undefined}
          >
            {isDirect && headerAvatarUrl ? (
              <img src={headerAvatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <span className={`text-sm ${isTopic ? "text-accent-400 font-bold" : isPrivateGroup ? "text-emerald-400" : "text-text-secondary"}`}>
                {isTopic ? "#" : isPrivateGroup ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                ) : displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div
              className={`text-[15px] font-bold text-text-primary ${isDirect ? "cursor-pointer hover:underline" : ""}`}
              onClick={isDirect ? () => setShowContactPanel(!showContactPanel) : undefined}
            >
              {displayName}
            </div>
            {isTopic ? (
              <button
                onClick={() => setShowMembers(!showMembers)}
                className="text-[11px] text-text-muted hover:text-text-secondary transition-colors"
              >
                {topic?.memberCount ?? 0} members {showMembers ? "\u25B4" : "\u25BE"}
              </button>
            ) : isPrivateGroup ? (
              <button
                onClick={() => setShowMembers(!showMembers)}
                className="text-[11px] text-text-muted hover:text-text-secondary transition-colors"
              >
                {group?.count ?? 0} members {showMembers ? "\u25B4" : "\u25BE"}
              </button>
            ) : (
              <div
                className="text-[11px] text-text-muted truncate max-w-[300px] cursor-pointer hover:text-text-secondary"
                onClick={() => setShowContactPanel(!showContactPanel)}
              >
                {session.targetAddress}
              </div>
            )}
          </div>
          {isDirect && (() => {
            const c = contacts.find((c) => c.address === session.targetAddress);
            const burnSec = c?.burnAfterSeconds ?? 0;
            if (burnSec <= 0) return null;
            const label = burnSec >= 86400 ? `${Math.floor(burnSec / 86400)}d`
              : burnSec >= 3600 ? `${Math.floor(burnSec / 3600)}h`
              : burnSec >= 60 ? `${Math.floor(burnSec / 60)}m`
              : `${burnSec}s`;
            return (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 text-[11px]" title="Burn after read active">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Burn: {label}
              </span>
            );
          })()}
          {isGroup && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowMembers(!showMembers)}
                className={`p-1.5 rounded transition-colors ${
                  showMembers
                    ? "bg-surface-hover text-text-primary"
                    : "text-text-muted hover:text-text-primary hover:bg-surface-hover"
                }`}
                title="Show members"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </button>
              <button
                onClick={() => setShowLeaveConfirm(true)}
                disabled={leaving}
                className="px-3 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-surface-hover rounded transition-colors disabled:opacity-50"
              >
                {leaving ? "Leaving..." : "Leave"}
              </button>
            </div>
          )}
        </div>

        {/* Messages */}
        <MessagesContainer key={activeSessionId} messages={messages} isTopic={!!isTopic} />

        {/* Input */}
        <MessageInput
          onSend={handleSend}
          onSendImage={handleSendImage}
          onSendAudio={handleSendAudio}
          onSendFile={handleSendFile}
        />
      </div>

      {/* Contact panel for direct chats */}
      {isDirect && showContactPanel && (() => {
        const contact = contacts.find((c) => c.address === session.targetAddress);
        if (!contact) return null;
        return (
          <ContactEditPanel
            contact={contact}
            onClose={() => setShowContactPanel(false)}
            onStartChat={() => setShowContactPanel(false)}
            onDelete={() => setShowContactPanel(false)}
          />
        );
      })()}

      {/* Subscriber / Member panel */}
      {isTopic && topicName && showMembers && (
        <SubscriberPanel topicName={topicName} onClose={() => setShowMembers(false)} />
      )}
      {isPrivateGroup && groupId && showMembers && (
        <PrivateGroupMemberPanel groupId={groupId} onClose={() => setShowMembers(false)} />
      )}

      {/* Leave confirmation dialog */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-base border border-surface-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-text-primary text-base font-semibold mb-2">
              Leave {isPrivateGroup ? "Group" : "Topic"}
            </h3>
            <p className="text-text-secondary text-sm mb-5">
              Are you sure you want to leave <span className="text-text-primary font-medium">{displayName}</span>?
              {isPrivateGroup && " This action cannot be undone and the conversation will be removed."}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary bg-surface-raised hover:bg-surface-hover rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowLeaveConfirm(false);
                  if (isTopic) {
                    await handleLeaveTopic();
                  } else {
                    await handleLeaveGroup();
                  }
                }}
                disabled={leaving}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {leaving ? "Leaving..." : "Leave"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
