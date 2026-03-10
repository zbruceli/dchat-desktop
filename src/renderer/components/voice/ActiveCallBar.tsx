import React, { useEffect, useState, useRef } from "react";
import { useVoiceCallStore } from "../../stores/voice-call-store";
import { useContactStore } from "../../stores/contact-store";
import { truncateAddress } from "../../utils/address";
import { useVoiceAudio } from "../../hooks/use-voice-audio";
import { useVideo, type VideoStats } from "../../hooks/use-video";
import { useRingtone } from "../../hooks/use-ringtone";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBitrate(bytesPerSec: number): string {
  const bps = bytesPerSec * 8;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} kbps`;
  return `${bps} bps`;
}

function VideoStatsPanel({ stats }: { stats: VideoStats }) {
  return (
    <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 text-[10px] font-mono text-white/70 space-y-1 min-w-[220px]">
      <div className="text-white/40 uppercase tracking-wider text-[9px] mb-1">Video Stats</div>
      <div className="flex justify-between gap-6">
        <div className="space-y-0.5">
          <div className="text-white/50 text-[9px]">Sending</div>
          <div>{stats.sendWidth}x{stats.sendHeight} @ {stats.sendFps} fps</div>
          <div>{formatBitrate(stats.sendBytesPerSec)}</div>
          <div className={stats.sendDropped > 0 ? "text-yellow-400" : ""}>
            Dropped: {stats.sendDropped}
          </div>
        </div>
        <div className="space-y-0.5">
          <div className="text-white/50 text-[9px]">Receiving</div>
          <div>{stats.recvWidth}x{stats.recvHeight} @ {stats.recvFps} fps</div>
          <div>{formatBitrate(stats.recvBytesPerSec)}</div>
          <div className={stats.recvDropped > 0 ? "text-yellow-400" : ""}>
            Dropped: {stats.recvDropped}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ActiveCallBar() {
  const activeCall = useVoiceCallStore((s) => s.activeCall);
  const isMuted = useVoiceCallStore((s) => s.isMuted);
  const isVideoOff = useVoiceCallStore((s) => s.isVideoOff);
  const endCall = useVoiceCallStore((s) => s.endCall);
  const toggleMute = useVoiceCallStore((s) => s.toggleMute);
  const toggleVideo = useVoiceCallStore((s) => s.toggleVideo);
  const contacts = useContactStore((s) => s.contacts);

  const [elapsed, setElapsed] = useState(0);
  const [showStats, setShowStats] = useState(false);

  const localCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize voice audio pipeline (always active for both call types)
  useVoiceAudio();

  // Initialize video pipeline (only active for video calls)
  const videoStats = useVideo({ localCanvasRef, remoteCanvasRef });

  // Play ringing tone while in "ringing" state
  const ringtone = useRingtone();
  useEffect(() => {
    if (activeCall?.state === "ringing") {
      ringtone.start();
      return () => ringtone.stop();
    }
  }, [activeCall?.state]);

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
  const isVideoCall = activeCall.callType === "video";

  const stateLabel = activeCall.state === "ringing" ? "Ringing..."
    : activeCall.state === "connecting" ? "Connecting..."
    : activeCall.state === "connected" ? formatDuration(elapsed)
    : "Ended";

  // Video call: full panel overlay
  if (isVideoCall && activeCall.state === "connected") {
    return (
      <div className="fixed inset-0 z-40 bg-black flex flex-col">
        {/* Remote video (main view) */}
        <div className="flex-1 relative flex items-center justify-center bg-gray-900">
          <canvas
            ref={remoteCanvasRef}
            className="max-w-full max-h-full object-contain"
          />
          {/* Overlay: name + timer */}
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className="text-white text-sm font-medium bg-black/40 rounded-full px-3 py-1">
              {displayName}
            </span>
            <span className="text-white/80 text-xs bg-black/40 rounded-full px-2 py-1">
              {stateLabel}
            </span>
          </div>

          {/* Local preview (PiP) */}
          <div className="absolute top-4 right-4 w-40 h-30 rounded-lg overflow-hidden border-2 border-white/20 shadow-lg bg-gray-800">
            <canvas
              ref={localCanvasRef}
              className="w-full h-full object-cover"
            />
            {isVideoOff && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-800/90">
                <span className="text-white/60 text-xs">Camera off</span>
              </div>
            )}
          </div>

          {/* Stats panel (bottom-left) */}
          {showStats && (
            <div className="absolute bottom-4 left-4">
              <VideoStatsPanel stats={videoStats} />
            </div>
          )}
        </div>

        {/* Controls bar */}
        <div className="bg-gray-900/95 px-6 py-4 flex items-center justify-center gap-4">
          {/* Mute toggle */}
          <button
            onClick={toggleMute}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              isMuted
                ? "bg-red-500/80 text-white"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>

          {/* Camera toggle */}
          <button
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              isVideoOff
                ? "bg-red-500/80 text-white"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
            title={isVideoOff ? "Turn camera on" : "Turn camera off"}
          >
            {isVideoOff ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>

          {/* Stats toggle */}
          <button
            onClick={() => setShowStats(!showStats)}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              showStats
                ? "bg-white/20 text-white"
                : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
            }`}
            title={showStats ? "Hide stats" : "Show stats"}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>

          {/* Hang up */}
          <button
            onClick={endCall}
            className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-colors"
            title="End call"
          >
            <svg className="w-6 h-6 rotate-[135deg]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Voice call (or video call not yet connected): thin bar at top
  return (
    <div className="fixed top-0 left-14 right-0 z-40 bg-green-600/95 backdrop-blur-sm px-4 py-2 flex items-center gap-3 shadow-lg">
      {/* Call info */}
      <div className="flex-1 flex items-center gap-3 min-w-0">
        <div className="w-7 h-7 rounded-full bg-green-500/50 flex items-center justify-center flex-shrink-0">
          {isVideoCall ? (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-white truncate">{displayName}</div>
          <div className="text-xs text-green-100">
            {isVideoCall ? "Video " : ""}{stateLabel}
          </div>
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
