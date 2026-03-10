import React, { useEffect } from "react";
import { useVoiceCallStore } from "../../stores/voice-call-store";
import { useContactStore } from "../../stores/contact-store";
import { truncateAddress } from "../../utils/address";
import { useRingtone } from "../../hooks/use-ringtone";

export function IncomingCallModal() {
  const incomingCall = useVoiceCallStore((s) => s.incomingCall);
  const acceptCall = useVoiceCallStore((s) => s.acceptCall);
  const declineCall = useVoiceCallStore((s) => s.declineCall);
  const contacts = useContactStore((s) => s.contacts);

  // Play ringing tone while modal is visible
  const ringtone = useRingtone();
  useEffect(() => {
    if (incomingCall) {
      ringtone.start();
      return () => ringtone.stop();
    }
  }, [!!incomingCall]);

  if (!incomingCall) return null;

  const contact = contacts.find((c) => c.address === incomingCall.remoteAddress);
  const displayName = contact?.name || truncateAddress(incomingCall.remoteAddress, 10, 8);
  const avatarUrl = contact?.avatarUri
    ? `dchat-media://contact-cache/${contact.avatarUri}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-base border border-surface-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl text-center">
        {/* Avatar */}
        <div className="w-16 h-16 rounded-full mx-auto mb-4 bg-surface-hover flex items-center justify-center overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl text-text-secondary">
              {displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Caller info */}
        <h3 className="text-text-primary text-lg font-semibold mb-1">{displayName}</h3>
        <p className="text-text-secondary text-sm mb-6">
          Incoming {incomingCall.callType === "video" ? "video" : "voice"} call...
        </p>

        {/* Accept / Decline */}
        <div className="flex justify-center gap-4">
          <button
            onClick={() => declineCall(incomingCall.callId)}
            className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-colors shadow-lg"
            title="Decline"
          >
            <svg className="w-6 h-6 rotate-[135deg]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
          <button
            onClick={() => acceptCall(incomingCall.callId)}
            className="w-14 h-14 rounded-full bg-green-600 hover:bg-green-700 text-white flex items-center justify-center transition-colors shadow-lg"
            title="Accept"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
