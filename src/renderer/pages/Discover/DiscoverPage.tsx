import React, { useEffect, useState } from "react";
import { useDiscoveryStore, selectFilteredGroups } from "../../stores/discovery-store";
import { useTopicStore } from "../../stores/topic-store";
import { useNavStore } from "../../stores/nav-store";
import { useChatStore } from "../../stores/chat-store";
import type { DiscoveredGroup } from "../../../shared/types";

export function DiscoverPage() {
  const {
    categories,
    selectedCategory,
    searchQuery,
    loading,
    refreshing,
    loadGroups,
    loadCategories,
    setSelectedCategory,
    setSearchQuery,
    refresh,
  } = useDiscoveryStore();

  const filteredGroups = useDiscoveryStore(selectFilteredGroups);

  useEffect(() => {
    loadGroups();
    loadCategories();
  }, [loadGroups, loadCategories]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface-base">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
        <h1 className="text-xl font-semibold text-text-primary">Discover Groups</h1>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-surface-raised hover:bg-surface-hover text-text-secondary transition-colors disabled:opacity-50"
        >
          <svg
            className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
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
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Search */}
      <div className="px-6 pt-4">
        <input
          type="text"
          placeholder="Search groups..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 bg-surface-raised border border-border-subtle rounded-lg text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-accent-500"
        />
      </div>

      {/* Category chips */}
      <div className="flex gap-2 px-6 pt-3 pb-2 overflow-x-auto">
        <CategoryChip
          label="All"
          active={selectedCategory === null}
          onClick={() => setSelectedCategory(null)}
        />
        {categories.map((cat) => (
          <CategoryChip
            key={cat}
            label={cat}
            active={selectedCategory === cat}
            onClick={() => setSelectedCategory(cat)}
          />
        ))}
      </div>

      {/* Group grid */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && filteredGroups.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-text-muted text-sm">
            Loading groups...
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-text-muted text-sm">
            No groups found
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGroups.map((group) => (
              <GroupCard key={group.topicName} group={group} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
        active
          ? "bg-accent-500 text-white"
          : "bg-surface-raised text-text-secondary hover:bg-surface-hover"
      }`}
    >
      {label}
    </button>
  );
}

function GroupCard({ group }: { group: DiscoveredGroup }) {
  const joinTopic = useTopicStore((s) => s.joinTopic);
  const setActiveNav = useNavStore((s) => s.setActiveNav);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    if (group.joined || joining) return;
    setJoining(true);
    try {
      await joinTopic(group.topicName);
      // Navigate to the topic chat
      setActiveSession(`topic:${group.topicName}`);
      setActiveNav("chat");
    } catch (err) {
      console.error("Failed to join topic:", err);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="flex flex-col p-4 bg-surface-raised rounded-xl border border-border-subtle hover:border-border-default transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-accent-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-accent-400 font-semibold text-sm">#</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-text-primary truncate">
              #{group.topicName}
            </h3>
            {group.category && (
              <span className="text-[10px] px-1.5 py-0.5 bg-surface-hover rounded text-text-muted">
                {group.category}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {group.description && (
        <p className="text-xs text-text-secondary mb-3 line-clamp-2">
          {group.description}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-2">
        <span className="text-xs text-text-muted flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          {group.subscriberCount}
        </span>

        {group.joined ? (
          <span className="px-3 py-1 text-xs rounded-lg bg-green-500/20 text-green-400">
            Joined
          </span>
        ) : (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="px-3 py-1 text-xs rounded-lg bg-accent-500 hover:bg-accent-600 text-white transition-colors disabled:opacity-50"
          >
            {joining ? "Joining..." : "Join"}
          </button>
        )}
      </div>
    </div>
  );
}
