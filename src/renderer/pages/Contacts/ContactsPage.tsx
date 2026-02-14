import React, { useEffect, useState } from "react";
import { useContactStore } from "../../stores/contact-store";
import { useChatStore } from "../../stores/chat-store";
import { useNavStore } from "../../stores/nav-store";
import { useSessionStore } from "../../stores/session-store";

export function ContactsPage() {
  const contacts = useContactStore((s) => s.contacts);
  const loadContacts = useContactStore((s) => s.loadContacts);
  const addContact = useContactStore((s) => s.addContact);
  const deleteContact = useContactStore((s) => s.deleteContact);
  const startSession = useChatStore((s) => s.startSession);
  const setActiveNav = useNavStore((s) => s.setActiveNav);
  const loadSessions = useSessionStore((s) => s.loadSessions);

  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  async function handleAdd() {
    const trimmedAddr = address.trim();
    if (!trimmedAddr) {
      setError("NKN address is required");
      return;
    }
    setError(null);
    try {
      await addContact(trimmedAddr, name.trim() || undefined);
      setAddress("");
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add contact");
    }
  }

  async function handleStartChat(contactAddress: string) {
    try {
      await startSession(contactAddress);
      await loadSessions();
      setActiveNav("chat");
    } catch (err) {
      console.error("Failed to start chat:", err);
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Add contact form */}
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Add Contact</h2>
        {error && (
          <div className="mb-3 p-2 rounded bg-red-900/30 border border-red-800 text-red-300 text-xs">
            {error}
          </div>
        )}
        <div className="space-y-2">
          <input
            type="text"
            placeholder="NKN address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-primary-500 text-sm font-mono"
          />
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Display name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-primary-500 text-sm"
            />
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-500">No contacts yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {contacts.map((contact) => (
              <div
                key={contact.address}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm text-gray-300">
                      {contact.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-gray-200 truncate">{contact.name}</div>
                    <div className="text-[10px] text-gray-500 font-mono truncate">
                      {contact.address}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0 ml-2">
                  <button
                    onClick={() => handleStartChat(contact.address)}
                    className="px-2 py-1 text-xs text-primary-400 hover:bg-gray-800 rounded transition-colors"
                  >
                    Chat
                  </button>
                  <button
                    onClick={() => deleteContact(contact.address)}
                    className="px-2 py-1 text-xs text-red-400 hover:bg-gray-800 rounded transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
