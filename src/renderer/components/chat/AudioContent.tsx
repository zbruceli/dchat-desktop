import React, { useRef, useState, useEffect, useCallback } from "react";
import type { Message, MessageOptions } from "../../../shared/types";
import { useChatStore } from "../../stores/chat-store";

interface AudioContentProps {
  message: Message;
}

function parseOptions(message: Message): MessageOptions | null {
  if (!message.options) return null;
  try {
    return JSON.parse(message.options) as MessageOptions;
  } catch {
    return null;
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Build a dchat-media:// URL from a local cache file path */
function audioCacheUrl(localPath: string): string {
  return `dchat-media://audio-cache/${localPath.split("/audio-cache/").pop()}`;
}

export function AudioContent({ message }: AudioContentProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const downloadAudio = useChatStore((s) => s.downloadAudio);

  const opts = parseOptions(message);
  const duration = opts?.mediaDuration ?? 0;
  const downloadFailed = message.localFilePath === "__download_failed__";
  const hasLocalFile = !!message.localFilePath && !downloadFailed;

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setCurrentTime(audio.currentTime);
    setProgress((audio.currentTime / audio.duration) * 100);
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
  }, []);

  const handleError = useCallback(() => {
    const audio = audioRef.current;
    if (audio?.error) {
      console.error("[AudioContent] playback error:", audio.error.code, audio.error.message);
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [handleTimeUpdate, handleEnded, handleError]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(console.error);
      setIsPlaying(true);
    }
  }

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    audio.currentTime = pct * audio.duration;
  }

  // Outbound sending
  if (message.isOutbound && message.status === "sending") {
    return (
      <div className="flex items-center gap-2 min-w-[180px]">
        <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </div>
        <span className="text-xs text-text-muted">Uploading...</span>
      </div>
    );
  }

  // Outbound failed
  if (message.isOutbound && message.status === "failed") {
    return (
      <div className="flex items-center gap-2 min-w-[180px]">
        <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </div>
        <span className="text-xs text-red-400">Send failed</span>
      </div>
    );
  }

  // Download failed (inbound IPFS audio) — show retry button
  if (downloadFailed) {
    return (
      <div className="flex items-center gap-2 min-w-[180px]">
        <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </div>
        <button
          onClick={() => downloadAudio(message.id)}
          className="text-xs text-red-400 hover:text-red-300 cursor-pointer transition-colors"
        >
          Download failed. Tap to retry
        </button>
      </div>
    );
  }

  // No encryption keys (inbound IPFS without keys)
  if (
    !message.isOutbound &&
    message.contentType === "ipfs" &&
    !hasLocalFile &&
    opts &&
    (!opts.ipfsEncryptKeyBytes || opts.ipfsEncryptKeyBytes.length === 0)
  ) {
    return (
      <div className="flex items-center gap-2 min-w-[180px]">
        <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </div>
        <span className="text-xs text-text-muted">Audio unavailable</span>
      </div>
    );
  }

  // Still downloading / missing local file — show tap-to-load for inline audio
  if (!hasLocalFile) {
    // Inline audio missing local file (e.g., cache cleared) — can re-save from content
    const isInlineAudio = message.contentType === "audio" && !!message.content;
    return (
      <div className="flex items-center gap-2 min-w-[180px]">
        <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </div>
        {isInlineAudio ? (
          <button
            onClick={() => downloadAudio(message.id)}
            className="text-xs text-text-muted hover:text-text-secondary cursor-pointer transition-colors"
          >
            Tap to load
          </button>
        ) : (
          <span className="text-xs text-text-muted">Downloading...</span>
        )}
      </div>
    );
  }

  // Ready to play
  const src = audioCacheUrl(message.localFilePath!);
  const displayTime = isPlaying ? currentTime : duration;

  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-surface-hover hover:bg-surface-border flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer"
      >
        {isPlaying ? (
          <svg className="w-4 h-4 text-text-primary" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-text-primary ml-0.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div
          className="h-1 bg-surface-border rounded-full cursor-pointer"
          onClick={handleProgressClick}
        >
          <div
            className="h-full bg-accent-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[10px] text-text-muted">
          {formatDuration(displayTime)}
        </span>
      </div>
    </div>
  );
}
