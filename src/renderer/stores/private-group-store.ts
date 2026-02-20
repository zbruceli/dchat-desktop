import { create } from "zustand";
import type { PrivateGroup, PrivateGroupMember } from "../../shared/types";

interface PrivateGroupState {
  groups: PrivateGroup[];
  loadGroups: () => Promise<void>;
  createGroup: (name: string) => Promise<PrivateGroup>;
  inviteMember: (groupId: string, targetAddress: string) => Promise<void>;
  acceptInvitation: (groupId: string) => Promise<void>;
  quitGroup: (groupId: string) => Promise<void>;
  kickMember: (groupId: string, targetAddress: string) => Promise<void>;
  getMembers: (groupId: string) => Promise<PrivateGroupMember[]>;
  handleGroupUpdate: (group: PrivateGroup) => void;
  handleGroupDelete: (groupId: string) => void;
}

export const usePrivateGroupStore = create<PrivateGroupState>((set) => ({
  groups: [],

  loadGroups: async () => {
    const groups = await window.dchat.privateGroup.list();
    set({ groups });
  },

  createGroup: async (name: string) => {
    const group = await window.dchat.privateGroup.create(name);
    const groups = await window.dchat.privateGroup.list();
    set({ groups });
    return group;
  },

  inviteMember: async (groupId: string, targetAddress: string) => {
    await window.dchat.privateGroup.invite(groupId, targetAddress);
  },

  acceptInvitation: async (groupId: string) => {
    await window.dchat.privateGroup.accept(groupId);
    const groups = await window.dchat.privateGroup.list();
    set({ groups });
  },

  quitGroup: async (groupId: string) => {
    await window.dchat.privateGroup.quit(groupId);
    const groups = await window.dchat.privateGroup.list();
    set({ groups });
  },

  kickMember: async (groupId: string, targetAddress: string) => {
    await window.dchat.privateGroup.kick(groupId, targetAddress);
  },

  getMembers: async (groupId: string) => {
    return window.dchat.privateGroup.getMembers(groupId);
  },

  handleGroupUpdate: (group: PrivateGroup) => {
    set((state) => {
      const idx = state.groups.findIndex((g) => g.groupId === group.groupId);
      let updated: PrivateGroup[];
      if (idx >= 0) {
        updated = [...state.groups];
        updated[idx] = group;
      } else {
        updated = [group, ...state.groups];
      }
      return { groups: updated };
    });
  },

  handleGroupDelete: (groupId: string) => {
    set((state) => ({
      groups: state.groups.filter((g) => g.groupId !== groupId),
    }));
  },
}));
