import React, { useState, useRef } from "react";
import { VoiceRecordButton } from "./VoiceRecordButton";

interface MessageInputProps {
  onSend: (content: string) => void;
  onSendImage?: () => void;
  onSendAudio?: (audioBuffer: ArrayBuffer, durationSeconds: number) => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, onSendImage, onSendAudio, disabled }: MessageInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    // Auto-resize textarea
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  return (
    <div className="flex items-end gap-2 p-3 border-t border-gray-800">
      {onSendImage && (
        <button
          onClick={onSendImage}
          disabled={disabled}
          className="p-2 text-gray-400 hover:text-gray-200 disabled:opacity-40 transition-colors flex-shrink-0"
          title="Send image"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </button>
      )}
      {onSendAudio && (
        <VoiceRecordButton
          onRecordComplete={onSendAudio}
          disabled={disabled}
        />
      )}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        rows={1}
        disabled={disabled}
        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-primary-500 resize-none overflow-hidden"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors flex-shrink-0"
      >
        Send
      </button>
    </div>
  );
}
