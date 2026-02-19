import { create } from "zustand";
import type { Profile } from "../../shared/types";

interface ProfileState {
  profile: Profile | null;
  loadProfile: () => Promise<void>;
  setNickname: (nickname: string) => Promise<void>;
  pickAndSetAvatar: () => Promise<void>;
  setProfile: (profile: Profile) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,

  loadProfile: async () => {
    const profile = await window.dchat.profile.get();
    set({ profile });
  },

  setNickname: async (nickname: string) => {
    const profile = await window.dchat.profile.setNickname(nickname);
    set({ profile });
  },

  pickAndSetAvatar: async () => {
    const filePath = await window.dchat.profile.pickAvatar();
    if (!filePath) return;
    const profile = await window.dchat.profile.setAvatar(filePath);
    set({ profile });
  },

  setProfile: (profile: Profile) => set({ profile }),
}));
