import React from "react";
import { useVoiceCallStore } from "../../stores/voice-call-store";

interface CallButtonProps {
  targetAddress: string;
}

export function CallButton({ targetAddress }: CallButtonProps) {
  const startCall = useVoiceCallStore((s) => s.startCall);
  const startVideoCall = useVoiceCallStore((s) => s.startVideoCall);
  const activeCall = useVoiceCallStore((s) => s.activeCall);

  const isInCall = !!activeCall;

  async function handleVoiceCall() {
    if (isInCall) return;
    try {
      await startCall(targetAddress);
    } catch (err) {
      console.error("Failed to start voice call:", err);
    }
  }

  async function handleVideoCall() {
    if (isInCall) return;
    try {
      await startVideoCall(targetAddress);
    } catch (err) {
      console.error("Failed to start video call:", err);
    }
  }

  return (
    <div className="flex items-center gap-0.5">
      {/* Video call */}
      <button
        onClick={handleVideoCall}
        disabled={isInCall}
        className={`p-1.5 rounded transition-colors ${
          isInCall
            ? "text-text-faint cursor-not-allowed"
            : "text-text-muted hover:text-blue-400 hover:bg-surface-hover"
        }`}
        title={isInCall ? "Already in a call" : "Video call"}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </button>
      {/* Voice call */}
      <button
        onClick={handleVoiceCall}
        disabled={isInCall}
        className={`p-1.5 rounded transition-colors ${
          isInCall
            ? "text-text-faint cursor-not-allowed"
            : "text-text-muted hover:text-green-400 hover:bg-surface-hover"
        }`}
        title={isInCall ? "Already in a call" : "Voice call"}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
          />
        </svg>
      </button>
    </div>
  );
}
