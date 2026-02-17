import React from "react";
import { useSessionStore } from "../../stores/session-store";
import { useChatStore } from "../../stores/chat-store";

export function SessionList() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const setActiveSession = useChatStore((s) => s.setActiveSession);

  if (sessions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-sm text-gray-500 text-center">
          No conversations yet. Add a contact to start chatting.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        const isTopic = session.type === "topic";
        const preview = session.lastMessageContent || "No messages yet";
        const time = session.lastMessageAt
          ? new Date(session.lastMessageAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";

        return (
          <button
            key={session.id}
            onClick={() => setActiveSession(session.id)}
            className={`w-full px-3 py-3 flex items-start gap-3 text-left transition-colors ${
              isActive ? "bg-gray-800" : "hover:bg-gray-800/50"
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              isTopic ? "bg-primary-900" : "bg-gray-700"
            }`}>
              <span className={`text-sm ${isTopic ? "text-primary-300 font-bold" : "text-gray-300"}`}>
                {isTopic ? "#" : session.targetName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-200 truncate">
                  {session.targetName}
                </span>
                <span className="text-[10px] text-gray-500 flex-shrink-0 ml-2">{time}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-gray-500 truncate">{preview}</span>
                {session.unreadCount > 0 && (
                  <span className="ml-2 flex-shrink-0 bg-primary-600 text-white text-[10px] font-medium rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {session.unreadCount > 99 ? "99+" : session.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
