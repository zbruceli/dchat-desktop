import React, { useEffect, useState } from "react";
import { useSessionStore } from "../../stores/session-store";
import { useContactStore } from "../../stores/contact-store";
import { useChatStore } from "../../stores/chat-store";
import { SessionList } from "../../components/chat/SessionList";
import { MessageThread } from "../../components/chat/MessageThread";

export function ChatPage() {
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const loadContacts = useContactStore((s) => s.loadContacts);
  const contacts = useContactStore((s) => s.contacts);
  const startSession = useChatStore((s) => s.startSession);

  const [showNewChat, setShowNewChat] = useState(false);
  const [newAddress, setNewAddress] = useState("");

  useEffect(() => {
    loadSessions();
    loadContacts();
  }, [loadSessions, loadContacts]);

  async function handleNewChat(address: string) {
    if (!address.trim()) return;
    try {
      await startSession(address.trim());
      await loadSessions();
      setShowNewChat(false);
      setNewAddress("");
    } catch (err) {
      console.error("Failed to start chat:", err);
    }
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* Session list sidebar */}
      <div className="w-72 border-r border-gray-800 flex flex-col min-h-0">
        <div className="px-3 py-3 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">Chats</h2>
          <button
            onClick={() => setShowNewChat(!showNewChat)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
            title="New chat"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {showNewChat && (
          <div className="px-3 py-2 border-b border-gray-800 space-y-2">
            <input
              type="text"
              placeholder="Enter NKN address..."
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNewChat(newAddress);
              }}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-primary-500 font-mono"
              autoFocus
            />
            {contacts.length > 0 && (
              <div className="max-h-32 overflow-y-auto">
                {contacts.map((contact) => (
                  <button
                    key={contact.address}
                    onClick={() => handleNewChat(contact.address)}
                    className="w-full px-2 py-1.5 text-left hover:bg-gray-800 rounded text-xs flex items-center gap-2"
                  >
                    <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-[9px] text-gray-300">
                        {contact.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-gray-300 truncate">{contact.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <SessionList />
      </div>

      {/* Message thread */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <MessageThread />
      </div>
    </div>
  );
}
