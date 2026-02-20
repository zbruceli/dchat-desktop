import React, { useEffect, useState } from "react";
import { useContactStore, filterAndSortContacts } from "../../stores/contact-store";
import type { ContactSortMode } from "../../stores/contact-store";
import { useChatStore } from "../../stores/chat-store";
import { useNavStore } from "../../stores/nav-store";
import { useSessionStore } from "../../stores/session-store";
import { ContactEditPanel } from "../../components/contact/ContactEditPanel";

export function ContactsPage() {
  const contacts = useContactStore((s) => s.contacts);
  const searchQuery = useContactStore((s) => s.searchQuery);
  const sortMode = useContactStore((s) => s.sortMode);
  const setSearchQuery = useContactStore((s) => s.setSearchQuery);
  const setSortMode = useContactStore((s) => s.setSortMode);
  const loadContacts = useContactStore((s) => s.loadContacts);
  const addContact = useContactStore((s) => s.addContact);
  const deleteContact = useContactStore((s) => s.deleteContact);
  const startSession = useChatStore((s) => s.startSession);
  const setActiveNav = useNavStore((s) => s.setActiveNav);
  const loadSessions = useSessionStore((s) => s.loadSessions);

  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const displayedContacts = filterAndSortContacts(contacts, searchQuery, sortMode);
  const selectedContact = selectedAddress
    ? contacts.find((c) => c.address === selectedAddress) ?? null
    : null;

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

  function handleDelete(contactAddress: string) {
    if (selectedAddress === contactAddress) {
      setSelectedAddress(null);
    }
    deleteContact(contactAddress);
  }

  function cycleSortMode() {
    setSortMode(sortMode === "name" ? "recent" : "name");
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* Left panel: add form + search + list */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Add contact form */}
        <div className="p-4 border-b border-surface-border">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">Add Contact</h2>
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
              className="w-full px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-text-primary placeholder-text-faint focus:outline-none focus:border-accent-500/50 text-sm font-mono"
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Display name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-text-primary placeholder-text-faint focus:outline-none focus:border-accent-500/50 text-sm"
              />
              <button
                onClick={handleAdd}
                className="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Search + Sort bar */}
        <div className="px-4 py-2 border-b border-surface-border flex items-center gap-2">
          <div className="flex-1 relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-faint"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-surface-raised border border-surface-border rounded-lg text-text-primary placeholder-text-faint focus:outline-none focus:border-accent-500/50 text-xs"
            />
          </div>
          <button
            onClick={cycleSortMode}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors whitespace-nowrap"
            title={`Sort: ${sortMode === "name" ? "A-Z" : "Recent"}`}
          >
            <SortIcon />
            {sortMode === "name" ? "A-Z" : "Recent"}
          </button>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {displayedContacts.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-text-muted">
                {contacts.length === 0
                  ? "No contacts yet"
                  : "No matching contacts"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-surface-border">
              {displayedContacts.map((contact) => {
                const isSelected = selectedAddress === contact.address;
                const avatarUrl = contact.avatarUri
                  ? `dchat-media://contact-cache/${contact.avatarUri}`
                  : null;

                return (
                  <div
                    key={contact.address}
                    onClick={() => setSelectedAddress(contact.address)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-accent-500/10 border-l-2 border-accent-500"
                        : "hover:bg-surface-hover/50 border-l-2 border-transparent"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-surface-hover flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={contact.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-sm text-text-secondary">
                          {contact.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-text-primary truncate">{contact.name}</div>
                      <div className="text-[10px] text-text-faint font-mono truncate">
                        {contact.address}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: edit */}
      {selectedContact && (
        <ContactEditPanel
          contact={selectedContact}
          onClose={() => setSelectedAddress(null)}
          onStartChat={handleStartChat}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

function SortIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
      />
    </svg>
  );
}
