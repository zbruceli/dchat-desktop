import React from "react";
import { useVoiceCallStore } from "../../stores/voice-call-store";

interface CallButtonProps {
  targetAddress: string;
}

export function CallButton({ targetAddress }: CallButtonProps) {
  const startCall = useVoiceCallStore((s) => s.startCall);
  const activeCall = useVoiceCallStore((s) => s.activeCall);

  const isInCall = !!activeCall;

  async function handleClick() {
    if (isInCall) return;
    try {
      await startCall(targetAddress);
    } catch (err) {
      console.error("Failed to start call:", err);
    }
  }

  return (
    <button
      onClick={handleClick}
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
  );
}
