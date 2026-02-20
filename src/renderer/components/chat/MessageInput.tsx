import React, { useState, useRef } from "react";
import { VoiceRecordButton } from "./VoiceRecordButton";

interface MessageInputProps {
  onSend: (content: string) => void;
  onSendImage?: () => void;
  onSendAudio?: (audioBuffer: ArrayBuffer, durationSeconds: number) => void;
  onSendFile?: () => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, onSendImage, onSendAudio, onSendFile, disabled }: MessageInputProps) {
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
    <div className="px-5 py-3">
      <div className="flex items-end gap-1 bg-surface-raised border border-surface-border rounded-lg focus-within:border-accent-500/50 transition-colors">
        {/* Attachment buttons inside container */}
        <div className="flex items-center pl-2 pb-2 gap-0.5">
          {onSendImage && (
            <button
              onClick={onSendImage}
              disabled={disabled}
              className="p-1.5 text-text-muted hover:text-text-primary disabled:opacity-40 transition-colors rounded"
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
          {onSendFile && (
            <button
              onClick={onSendFile}
              disabled={disabled}
              className="p-1.5 text-text-muted hover:text-text-primary disabled:opacity-40 transition-colors rounded"
              title="Send file"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
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
        </div>
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          disabled={disabled}
          className="flex-1 px-2 py-2.5 bg-transparent text-[15px] text-text-primary placeholder-text-faint focus:outline-none resize-none overflow-hidden"
        />
        {/* Send icon button */}
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="p-2 mr-1 mb-1 text-accent-500 hover:text-accent-400 disabled:text-text-faint disabled:opacity-40 transition-colors rounded"
          title="Send message"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
