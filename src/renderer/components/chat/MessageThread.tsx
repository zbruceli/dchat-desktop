import React, { useEffect, useRef } from "react";
import { useChatStore } from "../../stores/chat-store";
import { useSessionStore } from "../../stores/session-store";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";

export function MessageThread() {
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const messagesBySession = useChatStore((s) => s.messagesBySession);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendImage = useChatStore((s) => s.sendImage);
  const sendAudio = useChatStore((s) => s.sendAudio);
  const sendFile = useChatStore((s) => s.sendFile);
  const sessions = useSessionStore((s) => s.sessions);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevSessionRef = useRef<string | null>(null);
  const prevMessageCountRef = useRef<number>(0);

  const messages = activeSessionId ? messagesBySession[activeSessionId] ?? [] : [];
  const session = sessions.find((s) => s.id === activeSessionId);

  // Scroll to bottom: instantly on session switch, smoothly on new messages
  useEffect(() => {
    const sessionChanged = activeSessionId !== prevSessionRef.current;
    const messageCountChanged = messages.length !== prevMessageCountRef.current;

    prevSessionRef.current = activeSessionId;
    prevMessageCountRef.current = messages.length;

    if (sessionChanged) {
      // Instant scroll when opening a conversation
      messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
    } else if (messageCountChanged) {
      // Smooth scroll for new incoming/outgoing messages
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
    if (session) {
      sendMessage(session.targetAddress, content);
    }
  }

  function handleSendImage() {
    if (session) {
      sendImage(session.targetAddress);
    }
  }

  function handleSendAudio(audioBuffer: ArrayBuffer, durationSeconds: number) {
    if (session) {
      sendAudio(session.targetAddress, audioBuffer, durationSeconds);
    }
  }

  function handleSendFile() {
    if (session) {
      sendFile(session.targetAddress);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
          <span className="text-sm text-gray-300">
            {session.targetName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <div className="text-sm font-medium text-gray-200">{session.targetName}</div>
          <div className="text-[10px] text-gray-500 truncate max-w-[300px]">
            {session.targetAddress}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-500">No messages yet. Say hello!</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <MessageInput onSend={handleSend} onSendImage={handleSendImage} onSendAudio={handleSendAudio} onSendFile={handleSendFile} />
    </div>
  );
}
