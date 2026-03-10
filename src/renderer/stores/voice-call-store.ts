import { create } from "zustand";
import type { CallState, CallType, VoiceCallStateUpdate, IncomingCallInfo } from "../../shared/types";

interface VoiceCallState {
  activeCall: {
    callId: string;
    remoteAddress: string;
    state: CallState;
    startedAt?: number;
    callType: CallType;
    isVideoEnabled: boolean;
  } | null;
  incomingCall: IncomingCallInfo | null;
  isMuted: boolean;
  isVideoOff: boolean;

  startCall: (targetAddress: string, callType?: CallType) => Promise<void>;
  startVideoCall: (targetAddress: string) => Promise<void>;
  acceptCall: (callId: string) => Promise<void>;
  declineCall: (callId: string) => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;

  // Push event handlers
  handleCallStateUpdate: (state: VoiceCallStateUpdate | null) => void;
  handleIncomingCall: (call: IncomingCallInfo | null) => void;
}

let endedTimerId: ReturnType<typeof setTimeout> | null = null;

function clearEndedTimer() {
  if (endedTimerId) {
    clearTimeout(endedTimerId);
    endedTimerId = null;
  }
}

export const useVoiceCallStore = create<VoiceCallState>((set, get) => ({
  activeCall: null,
  incomingCall: null,
  isMuted: false,
  isVideoOff: false,

  startCall: async (targetAddress: string, callType: CallType = "voice") => {
    clearEndedTimer();
    await window.dchat.voice.startCall(targetAddress, callType);
  },

  startVideoCall: async (targetAddress: string) => {
    clearEndedTimer();
    await window.dchat.voice.startCall(targetAddress, "video");
  },

  acceptCall: async (callId: string) => {
    clearEndedTimer();
    await window.dchat.voice.acceptCall(callId);
    set({ incomingCall: null });
  },

  declineCall: async (callId: string) => {
    await window.dchat.voice.declineCall(callId);
    set({ incomingCall: null });
  },

  endCall: async () => {
    clearEndedTimer();
    await window.dchat.voice.endCall();
    set({ activeCall: null, isMuted: false, isVideoOff: false });
  },

  toggleMute: () => {
    set((state) => ({ isMuted: !state.isMuted }));
  },

  toggleVideo: () => {
    const current = get();
    const newVideoOff = !current.isVideoOff;
    set({ isVideoOff: newVideoOff });
    window.dchat.voice.toggleVideo(!newVideoOff);
  },

  handleCallStateUpdate: (update: VoiceCallStateUpdate | null) => {
    if (!update) {
      clearEndedTimer();
      set({ activeCall: null, isMuted: false, isVideoOff: false });
      return;
    }

    // Auto-dismiss after 5s when call ends
    if (update.state === "ended") {
      clearEndedTimer();
      endedTimerId = setTimeout(() => {
        endedTimerId = null;
        set({ activeCall: null, isMuted: false, isVideoOff: false });
      }, 5000);
    }

    set({
      activeCall: {
        callId: update.callId,
        remoteAddress: update.remoteAddress,
        state: update.state,
        startedAt: update.startedAt,
        callType: update.callType ?? "voice",
        isVideoEnabled: update.isVideoEnabled ?? false,
      },
    });
  },

  handleIncomingCall: (call: IncomingCallInfo | null) => {
    set({ incomingCall: call });
  },
}));
