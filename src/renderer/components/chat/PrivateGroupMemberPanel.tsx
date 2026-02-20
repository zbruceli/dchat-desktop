import React, { useEffect, useState } from "react";
import type { PrivateGroupMember } from "../../../shared/types";
import { PrivateGroupItemPerm } from "../../../shared/types";
import { usePrivateGroupStore } from "../../stores/private-group-store";
import { useContactStore } from "../../stores/contact-store";
import { useClientStore } from "../../stores/client-store";

function truncateAddr(addr: string): string {
  if (addr.length <= 20) return addr;
  return addr.substring(0, 10) + "..." + addr.substring(addr.length - 8);
}

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

export function PrivateGroupMemberPanel({
  groupId,
  onClose,
}: {
  groupId: string;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<PrivateGroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteAddr, setInviteAddr] = useState("");
  const [inviting, setInviting] = useState(false);
  const contacts = useContactStore((s) => s.contacts);
  const inviteMember = usePrivateGroupStore((s) => s.inviteMember);
  const kickMember = usePrivateGroupStore((s) => s.kickMember);
  const myAddress = useClientStore((s) => s.status?.address);

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

  async function handleInvite() {
    const addr = inviteAddr.trim();
    if (!addr) return;
    setInviting(true);
    try {
      await inviteMember(groupId, addr);
      setInviteAddr("");
      await loadMembers();
    } catch (err) {
      console.error("Failed to invite:", err);
    } finally {
      setInviting(false);
    }
  }

  async function handleKick(targetAddress: string) {
    try {
      await kickMember(groupId, targetAddress);
      await loadMembers();
    } catch (err) {
      console.error("Failed to kick:", err);
    }
  }

  function getDisplayName(address: string): string {
    const contact = contacts.find((c) => c.address === address);
    if (contact && contact.name && !contact.name.endsWith("...")) {
      return contact.name;
    }
    return truncateAddr(address);
  }

  return (
    <div className="w-56 border-l border-surface-border flex flex-col min-h-0 bg-surface-deep">
      <div className="px-3 py-2.5 border-b border-surface-border flex items-center justify-between">
        <span className="text-xs font-semibold text-text-secondary">
          Members ({activeMembers.length})
        </span>
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

      {/* Invite input (owner/admin only) */}
      {isAdmin && (
        <div className="px-3 py-2 border-b border-surface-border">
          <input
            type="text"
            placeholder="Invite NKN address..."
            value={inviteAddr}
            onChange={(e) => setInviteAddr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleInvite();
            }}
            className="w-full px-2 py-1 bg-surface-raised border border-surface-border rounded text-[10px] text-text-primary placeholder-text-faint focus:outline-none focus:border-accent-500/50 font-mono"
            disabled={inviting}
          />
          <button
            onClick={handleInvite}
            disabled={inviting || !inviteAddr.trim()}
            className="mt-1 w-full px-2 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[10px] rounded transition-colors"
          >
            {inviting ? "Inviting..." : "Invite"}
          </button>
        </div>
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
            {activeMembers.map((member) => (
              <div
                key={member.invitee}
                className="px-3 py-1.5 flex items-center gap-2 hover:bg-surface-hover/50 group"
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
                    onClick={() => handleKick(member.invitee)}
                    className="opacity-0 group-hover:opacity-100 text-[9px] text-red-400 hover:text-red-300 transition-opacity"
                    title="Remove member"
                  >
                    Kick
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
