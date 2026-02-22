import React, { useEffect, useState, useRef } from "react";
import type { PrivateGroupMember } from "../../../shared/types";
import { PrivateGroupItemPerm } from "../../../shared/types";
import { usePrivateGroupStore } from "../../stores/private-group-store";
import { useContactStore } from "../../stores/contact-store";
import { useClientStore } from "../../stores/client-store";
import { useUserProfilePanelStore } from "../../stores/user-profile-panel-store";
import { useProfileStore } from "../../stores/profile-store";
import { truncateAddress } from "../../utils/address";

function permLabel(perm: number): string {
  if (perm === PrivateGroupItemPerm.OWNER) return "Owner";
  if (perm === PrivateGroupItemPerm.ADMIN) return "Admin";
  if (perm >= PrivateGroupItemPerm.NORMAL) return "Member";
  if (perm === PrivateGroupItemPerm.QUIT) return "Left";
  if (perm === PrivateGroupItemPerm.BLACK) return "Blocked";
  return "";
}

function permColor(perm: number): string {
  if (perm === PrivateGroupItemPerm.OWNER) return "text-amber-400";
  if (perm === PrivateGroupItemPerm.ADMIN) return "text-accent-400";
  return "text-text-faint";
}

function InviteSection({
  contacts,
  members,
  myAddress,
  inviting,
  onInvite,
}: {
  contacts: { address: string; name?: string }[];
  members: PrivateGroupMember[];
  myAddress: string | undefined;
  inviting: boolean;
  onInvite: (addr: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const memberAddresses = new Set(members.map((m) => m.invitee));

  const invitable = contacts.filter(
    (c) => c.address !== myAddress && !memberAddresses.has(c.address),
  );

  const filtered = invitable.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.address.toLowerCase().includes(q) ||
      (c.name && c.name.toLowerCase().includes(q))
    );
  });

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function pick(addr: string) {
    setOpen(false);
    setSearch("");
    await onInvite(addr);
  }

  return (
    <div ref={panelRef} className="px-3 py-2 border-b border-surface-border">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          disabled={inviting}
          className="w-full px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[10px] rounded transition-colors flex items-center justify-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {inviting ? "Inviting..." : "Invite Member"}
        </button>
      ) : (
        <div>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search contacts or paste address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                setSearch("");
              }
              if (e.key === "Enter" && search.trim().length > 20 && filtered.length === 0) {
                // Direct address entry if no contact match
                pick(search.trim());
              }
            }}
            className="w-full px-2 py-1 bg-surface-raised border border-surface-border rounded text-[10px] text-text-primary placeholder-text-faint focus:outline-none focus:border-accent-500/50"
            disabled={inviting}
          />
          <div className="mt-1 max-h-40 overflow-y-auto bg-surface-raised border border-surface-border rounded">
            {filtered.length > 0 ? (
              filtered.map((c) => (
                <button
                  key={c.address}
                  onClick={() => pick(c.address)}
                  className="w-full px-2 py-1.5 text-left hover:bg-surface-hover transition-colors flex items-center gap-2"
                  disabled={inviting}
                >
                  <div className="w-5 h-5 rounded bg-surface-hover flex items-center justify-center flex-shrink-0">
                    <span className="text-[8px] text-text-secondary">
                      {(c.name || c.address).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    {c.name && !c.name.endsWith("...") ? (
                      <>
                        <span className="text-[10px] text-text-primary block truncate">{c.name}</span>
                        <span className="text-[9px] text-text-faint block truncate font-mono">{truncateAddress(c.address)}</span>
                      </>
                    ) : (
                      <span className="text-[10px] text-text-primary block truncate font-mono">{truncateAddress(c.address)}</span>
                    )}
                  </div>
                </button>
              ))
            ) : search.trim().length > 20 ? (
              <button
                onClick={() => pick(search.trim())}
                className="w-full px-2 py-1.5 text-left hover:bg-surface-hover transition-colors"
                disabled={inviting}
              >
                <span className="text-[10px] text-text-secondary">Invite: </span>
                <span className="text-[10px] text-text-primary font-mono">{truncateAddress(search.trim())}</span>
              </button>
            ) : (
              <div className="px-2 py-2 text-center">
                <span className="text-[10px] text-text-muted">
                  {invitable.length === 0 ? "All contacts already invited" : "No matches"}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PrivateGroupMemberPanel({
  groupId,
  onClose,
}: {
  groupId: string;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<PrivateGroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const contacts = useContactStore((s) => s.contacts);
  const groups = usePrivateGroupStore((s) => s.groups);
  const inviteMember = usePrivateGroupStore((s) => s.inviteMember);
  const kickMember = usePrivateGroupStore((s) => s.kickMember);
  const myAddress = useClientStore((s) => s.status?.address);
  const myNickname = useProfileStore((s) => s.profile?.nickname);
  const openProfile = useUserProfilePanelStore((s) => s.open);

  useEffect(() => {
    loadMembers();
  }, [groupId]);

  async function loadMembers() {
    setLoading(true);
    try {
      const m = await window.dchat.privateGroup.getMembers(groupId);
      setMembers(m);
    } catch (err) {
      console.error("Failed to load members:", err);
    } finally {
      setLoading(false);
    }
  }

  const myMember = members.find((m) => m.invitee === myAddress);
  const isOwner = myMember?.permission === PrivateGroupItemPerm.OWNER;
  const isAdmin = (myMember?.permission ?? 0) >= PrivateGroupItemPerm.ADMIN;
  const activeMembers = members.filter((m) => m.permission > PrivateGroupItemPerm.NONE);

  async function handleKick(targetAddress: string) {
    try {
      await kickMember(groupId, targetAddress);
      await loadMembers();
    } catch (err) {
      console.error("Failed to kick:", err);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await window.dchat.privateGroup.refreshMembers(groupId);
      // Wait briefly for memberResponse to arrive and be processed
      await new Promise((r) => setTimeout(r, 2000));
      const m = await window.dchat.privateGroup.getMembers(groupId);
      setMembers(m);
    } catch (err) {
      console.error("Failed to refresh members:", err);
    } finally {
      setRefreshing(false);
    }
  }

  function getDisplayName(address: string): string {
    if (address === myAddress && myNickname) {
      return myNickname;
    }
    const contact = contacts.find((c) => c.address === address);
    if (contact && contact.name && !contact.name.endsWith("...")) {
      return contact.name;
    }
    return truncateAddress(address);
  }

  return (
    <div className="w-56 border-l border-surface-border flex flex-col min-h-0 bg-surface-deep">
      <div className="px-3 py-2.5 border-b border-surface-border flex items-center justify-between">
        <span className="text-xs font-semibold text-text-secondary">
          Members ({activeMembers.length})
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors disabled:opacity-40"
            title="Refresh member list"
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
            className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors"
            title="Close"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Invite section (owner/admin only) */}
      {isAdmin && (
        <InviteSection
          contacts={contacts}
          members={activeMembers}
          myAddress={myAddress}
          inviting={inviting}
          onInvite={async (addr) => {
            setInviting(true);
            try {
              await inviteMember(groupId, addr);
              await loadMembers();
            } catch (err) {
              console.error("Failed to invite:", err);
            } finally {
              setInviting(false);
            }
          }}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-text-muted">Loading...</span>
          </div>
        ) : activeMembers.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-text-muted">No members</span>
          </div>
        ) : (
          <div className="py-1">
            {activeMembers.map((member) => {
              const group = groups.find((g) => g.groupId === groupId);
              return (
              <div
                key={member.invitee}
                className="px-3 py-1.5 flex items-center gap-2 hover:bg-surface-hover/50 group cursor-pointer"
                onClick={() => openProfile(member.invitee, {
                  groupId,
                  groupName: group?.name,
                  viewerPermission: myMember?.permission,
                  targetPermission: member.permission,
                })}
              >
                <div className="w-6 h-6 rounded-lg bg-surface-hover flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] text-text-secondary">
                    {member.invitee.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-text-secondary truncate block" title={member.invitee}>
                    {getDisplayName(member.invitee)}
                  </span>
                  <span className={`text-[9px] ${permColor(member.permission)}`}>
                    {permLabel(member.permission)}
                  </span>
                </div>
                {isOwner && member.invitee !== myAddress && member.permission < PrivateGroupItemPerm.OWNER && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleKick(member.invitee); }}
                    className="opacity-0 group-hover:opacity-100 text-[9px] text-red-400 hover:text-red-300 transition-opacity"
                    title="Remove member"
                  >
                    Kick
                  </button>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
