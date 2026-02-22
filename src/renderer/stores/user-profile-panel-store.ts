import { create } from "zustand";

export interface UserProfileContext {
  groupId?: string;
  groupName?: string;
  topicName?: string;
  viewerPermission?: number;
  targetPermission?: number;
}

interface UserProfilePanelState {
  isOpen: boolean;
  targetAddress: string | null;
  context: UserProfileContext | null;
  open: (address: string, context?: UserProfileContext) => void;
  close: () => void;
}

export const useUserProfilePanelStore = create<UserProfilePanelState>((set) => ({
  isOpen: false,
  targetAddress: null,
  context: null,

  open: (address, context) =>
    set({ isOpen: true, targetAddress: address, context: context ?? null }),

  close: () =>
    set({ isOpen: false, targetAddress: null, context: null }),
}));
