import { create } from "zustand";
import type { CallState, VoiceCallStateUpdate, IncomingCallInfo } from "../../shared/types";

interface VoiceCallState {
  activeCall: {
    callId: string;
    remoteAddress: string;
    state: CallState;
    startedAt?: number;
  } | null;
  incomingCall: IncomingCallInfo | null;
  isMuted: boolean;

  startCall: (targetAddress: string) => Promise<void>;
  acceptCall: (callId: string) => Promise<void>;
  declineCall: (callId: string) => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;

  // Push event handlers
  handleCallStateUpdate: (state: VoiceCallStateUpdate | null) => void;
  handleIncomingCall: (call: IncomingCallInfo | null) => void;
}

export const useVoiceCallStore = create<VoiceCallState>((set, get) => ({
  activeCall: null,
  incomingCall: null,
  isMuted: false,

  startCall: async (targetAddress: string) => {
    await window.dchat.voice.startCall(targetAddress);
  },

  acceptCall: async (callId: string) => {
    await window.dchat.voice.acceptCall(callId);
    set({ incomingCall: null });
  },

  declineCall: async (callId: string) => {
    await window.dchat.voice.declineCall(callId);
    set({ incomingCall: null });
  },

  endCall: async () => {
    await window.dchat.voice.endCall();
    set({ activeCall: null, isMuted: false });
  },

  toggleMute: () => {
    set((state) => ({ isMuted: !state.isMuted }));
  },

  handleCallStateUpdate: (update: VoiceCallStateUpdate | null) => {
    if (!update) {
      set({ activeCall: null, isMuted: false });
      return;
    }
    set({
      activeCall: {
        callId: update.callId,
        remoteAddress: update.remoteAddress,
        state: update.state,
        startedAt: update.startedAt,
      },
    });
  },

  handleIncomingCall: (call: IncomingCallInfo | null) => {
    set({ incomingCall: call });
  },
}));
