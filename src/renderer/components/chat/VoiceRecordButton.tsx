import React, { useState, useRef, useEffect, useCallback } from "react";

interface VoiceRecordButtonProps {
  onRecordComplete: (audioBuffer: ArrayBuffer, durationSeconds: number) => void;
  disabled?: boolean;
}

const MAX_DURATION = 60;
const MIN_DURATION = 0.5;

export function VoiceRecordButton({ onRecordComplete, disabled }: VoiceRecordButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopRecording = useCallback((send: boolean) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const durationSeconds = (Date.now() - startTimeRef.current) / 1000;

    if (send && durationSeconds >= MIN_DURATION) {
      // Let onstop handler finalize
      recorder.requestData();
      recorder.addEventListener(
        "stop",
        () => {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          blob.arrayBuffer().then((buffer) => {
            onRecordComplete(buffer, durationSeconds);
          });
          cleanup();
        },
        { once: true },
      );
      recorder.stop();
    } else {
      recorder.stop();
      cleanup();
    }

    setIsRecording(false);
    setElapsed(0);
  }, [onRecordComplete]);

  const cleanup = useCallback(() => {
    chunksRef.current = [];
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  // ESC to cancel
  useEffect(() => {
    if (!isRecording) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        stopRecording(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecording, stopRecording]);

  // Auto-stop at max duration
  useEffect(() => {
    if (elapsed >= MAX_DURATION && isRecording) {
      stopRecording(true);
    }
  }, [elapsed, isRecording, stopRecording]);

  async function startRecording() {
    setMicError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.start(100); // collect data every 100ms
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed((Date.now() - startTimeRef.current) / 1000);
      }, 100);
    } catch {
      setMicError(true);
      cleanup();
    }
  }

  function formatElapsed(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  if (micError) {
    return (
      <button
        onClick={() => setMicError(false)}
        className="p-2 text-red-400 hover:text-red-300 transition-colors flex-shrink-0"
        title="Microphone access denied. Click to retry."
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
          <line x1="4" y1="4" x2="20" y2="20" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
      </button>
    );
  }

  if (isRecording) {
    return (
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Cancel button */}
        <button
          onClick={() => stopRecording(false)}
          className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
          title="Cancel recording (ESC)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Recording indicator + timer */}
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs text-red-400 font-mono tabular-nums w-10">
            {formatElapsed(elapsed)}
          </span>
        </div>

        {/* Send button */}
        <button
          onClick={() => stopRecording(true)}
          className="p-1.5 text-green-400 hover:text-green-300 transition-colors cursor-pointer"
          title="Send voice message"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startRecording}
      disabled={disabled}
      className="p-2 text-gray-400 hover:text-gray-200 disabled:opacity-40 transition-colors flex-shrink-0 cursor-pointer"
      title="Record voice message"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
        />
      </svg>
    </button>
  );
}
