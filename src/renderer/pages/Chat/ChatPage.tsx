import React, { useEffect, useState } from "react";
import { useSessionStore } from "../../stores/session-store";
import { useContactStore } from "../../stores/contact-store";
import { useChatStore } from "../../stores/chat-store";
import { useTopicStore } from "../../stores/topic-store";
import { usePrivateGroupStore } from "../../stores/private-group-store";
import { useDiscoveryStore } from "../../stores/discovery-store";
import { SessionList } from "../../components/chat/SessionList";
import { MessageThread } from "../../components/chat/MessageThread";

export function ChatPage() {
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const loadContacts = useContactStore((s) => s.loadContacts);
  const loadTopics = useTopicStore((s) => s.loadTopics);
  const loadGroups = usePrivateGroupStore((s) => s.loadGroups);
  const loadDiscoveredGroups = useDiscoveryStore((s) => s.loadGroups);
  const contacts = useContactStore((s) => s.contacts);
  const startSession = useChatStore((s) => s.startSession);
  const createTopic = useTopicStore((s) => s.createTopic);
  const createGroup = usePrivateGroupStore((s) => s.createGroup);
  const setActiveSession = useChatStore((s) => s.setActiveSession);

  const [showNewChat, setShowNewChat] = useState(false);
  const [showJoinTopic, setShowJoinTopic] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [topicName, setTopicName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [topicJoining, setTopicJoining] = useState(false);
  const [groupCreating, setGroupCreating] = useState(false);

  useEffect(() => {
    loadSessions();
    loadContacts();
    loadTopics();
    loadGroups();
    loadDiscoveredGroups();
  }, [loadSessions, loadContacts, loadTopics, loadGroups, loadDiscoveredGroups]);

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

  async function handleJoinTopic() {
    const name = topicName.trim();
    if (!name) return;
    setTopicJoining(true);
    try {
      await createTopic(name);
      await loadSessions();
      setActiveSession(`topic:${name}`);
      setShowJoinTopic(false);
      setTopicName("");
    } catch (err) {
      console.error("Failed to join topic:", err);
    } finally {
      setTopicJoining(false);
    }
  }

  async function handleCreateGroup() {
    const name = groupName.trim();
    if (!name) return;
    setGroupCreating(true);
    try {
      const group = await createGroup(name);
      await loadSessions();
      setActiveSession(`privateGroup:${group.groupId}`);
      setShowCreateGroup(false);
      setGroupName("");
    } catch (err) {
      console.error("Failed to create group:", err);
    } finally {
      setGroupCreating(false);
    }
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* Session list sidebar */}
      <div className="w-72 bg-surface-deep border-r border-surface-border flex flex-col min-h-0">
        <div className="px-3 py-3 border-b border-surface-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-secondary">Chats</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowCreateGroup(!showCreateGroup); setShowJoinTopic(false); setShowNewChat(false); }}
              className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
              title="Create private group"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </button>
            <button
              onClick={() => { setShowJoinTopic(!showJoinTopic); setShowNewChat(false); setShowCreateGroup(false); }}
              className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
              title="Join topic"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
            </button>
            <button
              onClick={() => { setShowNewChat(!showNewChat); setShowJoinTopic(false); setShowCreateGroup(false); }}
              className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
              title="New chat"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>

        {showCreateGroup && (
          <div className="px-3 py-2 border-b border-surface-border space-y-2">
            <div className="text-[10px] text-text-muted uppercase tracking-wide">Create Private Group</div>
            <input
              type="text"
              placeholder="Group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateGroup();
              }}
              className="w-full px-2 py-1.5 bg-surface-raised border border-surface-border rounded-lg text-xs text-text-primary placeholder-text-faint focus:outline-none focus:border-accent-500/50"
              autoFocus
              disabled={groupCreating}
            />
            <button
              onClick={handleCreateGroup}
              disabled={groupCreating || !groupName.trim()}
              className="w-full px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors"
            >
              {groupCreating ? "Creating..." : "Create"}
            </button>
          </div>
        )}

        {showJoinTopic && (
          <div className="px-3 py-2 border-b border-surface-border space-y-2">
            <div className="text-[10px] text-text-muted uppercase tracking-wide">Join Topic</div>
            <input
              type="text"
              placeholder="Topic name (e.g. general)"
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoinTopic();
              }}
              className="w-full px-2 py-1.5 bg-surface-raised border border-surface-border rounded-lg text-xs text-text-primary placeholder-text-faint focus:outline-none focus:border-accent-500/50 font-mono"
              autoFocus
              disabled={topicJoining}
            />
            <button
              onClick={handleJoinTopic}
              disabled={topicJoining || !topicName.trim()}
              className="w-full px-2 py-1.5 bg-accent-500 hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors"
            >
              {topicJoining ? "Joining..." : "Join"}
            </button>
          </div>
        )}

        {showNewChat && (
          <div className="px-3 py-2 border-b border-surface-border space-y-2">
            <input
              type="text"
              placeholder="Enter NKN address..."
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNewChat(newAddress);
              }}
              className="w-full px-2 py-1.5 bg-surface-raised border border-surface-border rounded-lg text-xs text-text-primary placeholder-text-faint focus:outline-none focus:border-accent-500/50 font-mono"
              autoFocus
            />
            {contacts.length > 0 && (
              <div className="max-h-32 overflow-y-auto">
                {contacts.map((contact) => (
                  <button
                    key={contact.address}
                    onClick={() => handleNewChat(contact.address)}
                    className="w-full px-2 py-1.5 text-left hover:bg-surface-hover rounded text-xs flex items-center gap-2"
                  >
                    <div className="w-5 h-5 rounded-lg bg-surface-hover flex items-center justify-center flex-shrink-0">
                      <span className="text-[9px] text-text-secondary">
                        {contact.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-text-secondary truncate">{contact.name}</span>
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
