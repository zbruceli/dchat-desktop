import React from "react";
import { useSessionStore } from "../../stores/session-store";
import { useChatStore } from "../../stores/chat-store";
import { useContactStore } from "../../stores/contact-store";

export function SessionList() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const contacts = useContactStore((s) => s.contacts);

  if (sessions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-sm text-text-muted text-center">
          No conversations yet. Add a contact to start chatting.
        </p>
      </div>
    );
  }

  async function toggleMute(e: React.MouseEvent, sessionId: string, currentMuted: boolean) {
    e.stopPropagation();
    await window.dchat.session.setMuted(sessionId, !currentMuted);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        const isTopic = session.type === "topic";
        const isPrivateGroup = session.type === "privateGroup";
        const isDirect = !isTopic && !isPrivateGroup;
        // For 1-to-1 sessions, resolve contact name at render time
        const contact = isDirect ? contacts.find((c) => c.address === session.targetAddress) : undefined;
        const displayName = (isDirect
          ? (contact?.name || session.targetName)
          : session.targetName) || "";
        const avatarUrl = contact?.avatarUri
          ? `dchat-media://contact-cache/${contact.avatarUri}`
          : null;
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
            className={`group w-full px-3 py-2.5 flex items-center gap-3 text-left transition-colors ${
              isActive ? "bg-accent-500/10" : "hover:bg-surface-hover/50"
            }`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden ${
              isTopic ? "bg-accent-700/30" : isPrivateGroup ? "bg-emerald-700/30" : "bg-surface-hover"
            }`}>
              {isDirect && avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
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
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-text-primary truncate">
                  {displayName}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  {session.muted && (
                    <svg className="w-3.5 h-3.5 text-text-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  )}
                  <span className="text-[11px] text-text-muted">{time}</span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-text-muted truncate">{preview}</span>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  <span
                    onClick={(e) => toggleMute(e, session.id, session.muted)}
                    title={session.muted ? "Unmute notifications" : "Mute notifications"}
                    className="hidden group-hover:flex w-5 h-5 items-center justify-center rounded hover:bg-surface-border/50 cursor-pointer"
                  >
                    {session.muted ? (
                      <svg className="w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                      </svg>
                    )}
                  </span>
                  {session.unreadCount > 0 && (
                    <span className="bg-badge text-white text-[10px] font-medium rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {session.unreadCount > 99 ? "99+" : session.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
