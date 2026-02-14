import React, { useState, useRef } from "react";

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
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
