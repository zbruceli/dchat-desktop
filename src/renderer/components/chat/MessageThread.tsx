import React, { useEffect, useRef, useState } from "react";
import { useChatStore } from "../../stores/chat-store";
import { useSessionStore } from "../../stores/session-store";
import { useTopicStore } from "../../stores/topic-store";
import { useContactStore } from "../../stores/contact-store";
import type { TopicSubscriber } from "../../../shared/types";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";

/** Truncate an NKN address for display */
function truncateAddr(addr: string): string {
  if (addr.length <= 20) return addr;
  return addr.substring(0, 10) + "..." + addr.substring(addr.length - 8);
}

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
    const contact = contacts.find((c) => c.address === address);
    if (contact && contact.name && !contact.name.endsWith("...")) {
      return contact.name;
    }
    return truncateAddr(address);
  }

  return (
    <div className="w-56 border-l border-gray-800 flex flex-col min-h-0 bg-gray-900/50">
      <div className="px-3 py-2.5 border-b border-gray-800 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-300">
          Members ({subscribers.length})
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
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
            className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
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
            <span className="text-xs text-gray-500">Loading...</span>
          </div>
        ) : subscribers.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-gray-500">No subscribers yet</span>
          </div>
        ) : (
          <div className="py-1">
            {subscribers.map((sub) => (
              <div
                key={sub.contactAddress}
                className="px-3 py-1.5 flex items-center gap-2 hover:bg-gray-800/50"
              >
                <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] text-gray-300">
                    {sub.contactAddress.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-xs text-gray-300 truncate" title={sub.contactAddress}>
                  {getDisplayName(sub.contactAddress)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function MessageThread() {
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const messagesBySession = useChatStore((s) => s.messagesBySession);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendImage = useChatStore((s) => s.sendImage);
  const sendAudio = useChatStore((s) => s.sendAudio);
  const sendFile = useChatStore((s) => s.sendFile);
  const sessions = useSessionStore((s) => s.sessions);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const topics = useTopicStore((s) => s.topics);
  const leaveTopic = useTopicStore((s) => s.leaveTopic);

  const [leaving, setLeaving] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevSessionRef = useRef<string | null>(null);
  const prevMessageCountRef = useRef<number>(0);

  const messages = activeSessionId ? messagesBySession[activeSessionId] ?? [] : [];
  const session = sessions.find((s) => s.id === activeSessionId);
  const isTopic = session?.type === "topic";
  const topicName = isTopic ? session.targetAddress : null;
  const topic = topicName ? topics.find((t) => t.id === topicName) : null;

  // Close members panel when switching away from a topic
  useEffect(() => {
    if (!isTopic) setShowMembers(false);
  }, [activeSessionId, isTopic]);

  // Scroll to bottom: instantly on session switch, smoothly on new messages
  useEffect(() => {
    const sessionChanged = activeSessionId !== prevSessionRef.current;
    const messageCountChanged = messages.length !== prevMessageCountRef.current;

    prevSessionRef.current = activeSessionId;
    prevMessageCountRef.current = messages.length;

    if (sessionChanged) {
      messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
    } else if (messageCountChanged) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeSessionId, messages.length]);

  if (!activeSessionId || !session) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-500">Select a conversation to start messaging</p>
      </div>
    );
  }

  function handleSend(content: string) {
    if (!session) return;
    if (isTopic && topicName) {
      window.dchat.topic.sendMessage(topicName, content).catch(console.error);
    } else {
      sendMessage(session.targetAddress, content);
    }
  }

  function handleSendImage() {
    if (session && !isTopic) {
      sendImage(session.targetAddress);
    }
  }

  function handleSendAudio(audioBuffer: ArrayBuffer, durationSeconds: number) {
    if (session && !isTopic) {
      sendAudio(session.targetAddress, audioBuffer, durationSeconds);
    }
  }

  function handleSendFile() {
    if (session && !isTopic) {
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

  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isTopic ? "bg-primary-900" : "bg-gray-700"
          }`}>
            <span className={`text-sm ${isTopic ? "text-primary-300 font-bold" : "text-gray-300"}`}>
              {isTopic ? "#" : session.targetName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-200">{session.targetName}</div>
            {isTopic ? (
              <button
                onClick={() => setShowMembers(!showMembers)}
                className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                {topic?.memberCount ?? 0} members {showMembers ? "\u25B4" : "\u25BE"}
              </button>
            ) : (
              <div className="text-[10px] text-gray-500 truncate max-w-[300px]">
                {session.targetAddress}
              </div>
            )}
          </div>
          {isTopic && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowMembers(!showMembers)}
                className={`p-1.5 rounded transition-colors ${
                  showMembers
                    ? "bg-gray-700 text-gray-200"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                }`}
                title="Show members"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </button>
              <button
                onClick={handleLeaveTopic}
                disabled={leaving}
                className="px-3 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
              >
                {leaving ? "Leaving..." : "Leave"}
              </button>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-gray-500">
                {isTopic ? "No messages yet in this topic." : "No messages yet. Say hello!"}
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} showSender={isTopic} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <MessageInput
          onSend={handleSend}
          onSendImage={isTopic ? undefined : handleSendImage}
          onSendAudio={isTopic ? undefined : handleSendAudio}
          onSendFile={isTopic ? undefined : handleSendFile}
        />
      </div>

      {/* Subscriber panel */}
      {isTopic && topicName && showMembers && (
        <SubscriberPanel topicName={topicName} onClose={() => setShowMembers(false)} />
      )}
    </div>
  );
}
