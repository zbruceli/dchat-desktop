import React, { useEffect, useState } from "react";
import { useVoiceCallStore } from "../../stores/voice-call-store";
import { useContactStore } from "../../stores/contact-store";
import { truncateAddress } from "../../utils/address";
import { useVoiceAudio } from "../../hooks/use-voice-audio";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ActiveCallBar() {
  const activeCall = useVoiceCallStore((s) => s.activeCall);
  const isMuted = useVoiceCallStore((s) => s.isMuted);
  const endCall = useVoiceCallStore((s) => s.endCall);
  const toggleMute = useVoiceCallStore((s) => s.toggleMute);
  const contacts = useContactStore((s) => s.contacts);

  const [elapsed, setElapsed] = useState(0);

  // Initialize voice audio pipeline
  useVoiceAudio();

  // Timer for call duration
  useEffect(() => {
    if (!activeCall?.startedAt) {
      setElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - activeCall.startedAt!) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [activeCall?.startedAt]);

  if (!activeCall) return null;

  const contact = contacts.find((c) => c.address === activeCall.remoteAddress);
  const displayName = contact?.name || truncateAddress(activeCall.remoteAddress, 10, 8);

  const stateLabel = activeCall.state === "ringing" ? "Ringing..."
    : activeCall.state === "connecting" ? "Connecting..."
    : activeCall.state === "connected" ? formatDuration(elapsed)
    : "Ended";

  return (
    <div className="fixed top-0 left-14 right-0 z-40 bg-green-600/95 backdrop-blur-sm px-4 py-2 flex items-center gap-3 shadow-lg">
      {/* Call info */}
      <div className="flex-1 flex items-center gap-3 min-w-0">
        <div className="w-7 h-7 rounded-full bg-green-500/50 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-white truncate">{displayName}</div>
          <div className="text-xs text-green-100">{stateLabel}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Mute toggle */}
        <button
          onClick={toggleMute}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
            isMuted
              ? "bg-red-500/80 text-white"
              : "bg-green-500/50 text-white hover:bg-green-500/70"
          }`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>

        {/* Hang up */}
        <button
          onClick={endCall}
          className="w-8 h-8 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-colors"
          title="End call"
        >
          <svg className="w-4 h-4 rotate-[135deg]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
