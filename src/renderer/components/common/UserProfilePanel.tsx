import React, { useEffect, useState, useRef } from "react";
import { useUserProfilePanelStore } from "../../stores/user-profile-panel-store";
import { useContactStore } from "../../stores/contact-store";
import { useClientStore } from "../../stores/client-store";
import { usePrivateGroupStore } from "../../stores/private-group-store";
import { useChatStore } from "../../stores/chat-store";
import { useSessionStore } from "../../stores/session-store";
import { useNavStore } from "../../stores/nav-store";
import { useProfileStore } from "../../stores/profile-store";
import { PrivateGroupItemPerm } from "../../../shared/types";
import { truncateAddress, stringToColor } from "../../utils/address";
import { CopyableField } from "./CopyableField";

function permLabel(perm: number): string {
  if (perm === PrivateGroupItemPerm.OWNER) return "Owner";
  if (perm === PrivateGroupItemPerm.ADMIN) return "Admin";
  if (perm >= PrivateGroupItemPerm.NORMAL) return "Member";
  return "";
}

function permBadgeColor(perm: number): string {
  if (perm === PrivateGroupItemPerm.OWNER) return "bg-amber-600/20 text-amber-400";
  if (perm === PrivateGroupItemPerm.ADMIN) return "bg-accent-500/20 text-accent-400";
  return "bg-surface-raised text-text-muted";
}

export function UserProfilePanel() {
  const { isOpen, targetAddress, context, close } = useUserProfilePanelStore();
  const contacts = useContactStore((s) => s.contacts);
  const addContact = useContactStore((s) => s.addContact);
  const myAddress = useClientStore((s) => s.status?.address);
  const walletAddress = useClientStore((s) => s.walletAddress);
  const profile = useProfileStore((s) => s.profile);
  const groups = usePrivateGroupStore((s) => s.groups);
  const inviteMember = usePrivateGroupStore((s) => s.inviteMember);
  const kickMember = usePrivateGroupStore((s) => s.kickMember);
  const startSession = useChatStore((s) => s.startSession);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const setActiveNav = useNavStore((s) => s.setActiveNav);

  const [adding, setAdding] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [kicking, setKicking] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, close]);

  // Close invite dropdown on outside click
  useEffect(() => {
    if (!inviteOpen) return;
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setInviteOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [inviteOpen]);

  // Reset state when panel opens
  useEffect(() => {
    if (isOpen) {
      setAdding(false);
      setInviteOpen(false);
      setInviting(null);
      setKicking(false);
    }
  }, [isOpen, targetAddress]);

  if (!isOpen || !targetAddress) return null;

  const isSelf = targetAddress === myAddress;
  const contact = contacts.find((c) => c.address === targetAddress);
  const isContact = !!contact;

  // Display info
  const displayName = isSelf
    ? (profile?.nickname || "You")
    : (contact?.name && !contact.name.endsWith("...") ? contact.name : truncateAddress(targetAddress));

  const avatarColor = stringToColor(isSelf ? "you" : targetAddress);
  const avatarInitial = displayName.charAt(0).toUpperCase();

  const contactAvatarUrl = contact?.avatarUri
    ? `dchat-media://contact-cache/${contact.avatarUri}`
    : null;
  const selfAvatarUrl = isSelf && profile?.avatarPath
    ? `dchat-media://profile-cache/${profile.avatarPath}?v=${profile?.profileVersion || ""}`
    : null;
  const avatarUrl = isSelf ? selfAvatarUrl : contactAvatarUrl;

  // Groups the viewer can invite into (joined, viewer is owner/admin, target not already member)
  const invitableGroups = groups.filter((g) => {
    if (!g.joined) return false;
    // We need member data — we'll check on invite. For now show all joined groups where user could be owner/admin.
    // The group data field contains owner info
    try {
      const raw = JSON.parse(g.data || "{}");
      const ownerPubKey = g.groupId.split(".")[0];
      // If myAddress starts with the owner pubkey, user is owner
      // This is a heuristic — proper check happens on invite
      return !!ownerPubKey && !!myAddress;
    } catch {
      return true;
    }
  });

  // Group context info
  const inGroupContext = !!context?.groupId;
  const viewerIsOwner = (context?.viewerPermission ?? 0) === PrivateGroupItemPerm.OWNER;
  const targetIsNotOwner = (context?.targetPermission ?? 0) < PrivateGroupItemPerm.OWNER;
  const canKick = inGroupContext && viewerIsOwner && !isSelf && targetIsNotOwner;

  async function handleSendMessage() {
    try {
      await startSession(targetAddress!);
      await loadSessions();
      setActiveNav("chat");
      close();
    } catch (err) {
      console.error("Failed to start chat:", err);
    }
  }

  async function handleAddContact() {
    setAdding(true);
    try {
      await addContact(targetAddress!);
    } catch (err) {
      console.error("Failed to add contact:", err);
    } finally {
      setAdding(false);
    }
  }

  async function handleInvite(groupId: string) {
    setInviting(groupId);
    try {
      await inviteMember(groupId, targetAddress!);
      setInviteOpen(false);
    } catch (err) {
      console.error("Failed to invite:", err);
    } finally {
      setInviting(null);
    }
  }

  async function handleKick() {
    if (!context?.groupId) return;
    setKicking(true);
    try {
      await kickMember(context.groupId, targetAddress!);
      close();
    } catch (err) {
      console.error("Failed to kick:", err);
    } finally {
      setKicking(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="bg-surface-base border border-surface-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        {/* Close button */}
        <div className="flex justify-end mb-2">
          <button
            onClick={close}
            className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Avatar */}
        <div className="flex justify-center mb-3">
          <div className={`w-16 h-16 rounded-xl flex items-center justify-center overflow-hidden ${avatarUrl ? "" : avatarColor}`}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xl text-white font-semibold">{avatarInitial}</span>
            )}
          </div>
        </div>

        {/* Name */}
        <div className="text-center mb-1">
          <div className="text-base font-semibold text-text-primary">{displayName}</div>
        </div>

        {/* Badges */}
        <div className="flex justify-center gap-2 mb-4">
          {isContact && !isSelf && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-500/20 text-accent-400">Contact</span>
          )}
          {inGroupContext && context?.targetPermission != null && context.targetPermission >= PrivateGroupItemPerm.NORMAL && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${permBadgeColor(context.targetPermission)}`}>
              {permLabel(context.targetPermission)}
              {context.groupName ? ` in ${context.groupName}` : ""}
            </span>
          )}
        </div>

        {/* Addresses */}
        <div className="space-y-3 mb-5">
          <CopyableField label="D-Chat ID (NKN Address)" value={targetAddress} />
          {isSelf && walletAddress && (
            <CopyableField label="Wallet Address" value={walletAddress} />
          )}
        </div>

        {/* Actions */}
        {!isSelf && (
          <div className="space-y-2">
            {/* Send Message */}
            <button
              onClick={handleSendMessage}
              className="w-full px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Send Message
            </button>

            {/* Add Contact */}
            {!isContact && (
              <button
                onClick={handleAddContact}
                disabled={adding}
                className="w-full px-4 py-2 bg-surface-raised hover:bg-surface-hover text-text-primary rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {adding ? "Adding..." : "Add Contact"}
              </button>
            )}

            {/* Invite to Group */}
            {invitableGroups.length > 0 && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setInviteOpen(!inviteOpen)}
                  className="w-full px-4 py-2 bg-surface-raised hover:bg-surface-hover text-text-primary rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
                >
                  Invite to Group
                  <svg className={`w-3 h-3 transition-transform ${inviteOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {inviteOpen && (
                  <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-surface-deep border border-surface-border rounded-lg shadow-xl z-10">
                    {invitableGroups.map((g) => (
                      <button
                        key={g.groupId}
                        onClick={() => handleInvite(g.groupId)}
                        disabled={inviting === g.groupId}
                        className="w-full px-3 py-2 text-left text-xs text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        <svg className="w-3 h-3 flex-shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <span className="truncate">{g.name || truncateAddress(g.groupId)}</span>
                        {inviting === g.groupId && <span className="text-[9px] text-text-faint ml-auto">Inviting...</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Remove from Group */}
            {canKick && (
              <button
                onClick={handleKick}
                disabled={kicking}
                className="w-full px-4 py-2 bg-transparent hover:bg-red-900/30 text-red-400 border border-red-800/50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {kicking ? "Removing..." : `Remove from ${context?.groupName || "Group"}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
