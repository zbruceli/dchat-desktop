import React, { useEffect } from "react";
import { useSessionStore } from "../../stores/session-store";
import { SessionList } from "../../components/chat/SessionList";
import { MessageThread } from "../../components/chat/MessageThread";

export function ChatPage() {
  const loadSessions = useSessionStore((s) => s.loadSessions);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return (
    <div className="flex-1 flex">
      {/* Session list sidebar */}
      <div className="w-72 border-r border-gray-800 flex flex-col">
        <div className="px-3 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300">Chats</h2>
        </div>
        <SessionList />
      </div>

      {/* Message thread */}
      <div className="flex-1 flex flex-col">
        <MessageThread />
      </div>
    </div>
  );
}
