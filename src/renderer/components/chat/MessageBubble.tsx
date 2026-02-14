import React from "react";
import type { Message } from "../../../shared/types";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.isOutbound;
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const statusIcon =
    message.status === "sending"
      ? "\u25CB" // circle
      : message.status === "sent"
        ? "\u2713" // check
        : message.status === "delivered"
          ? "\u2713\u2713" // double check
          : message.status === "failed"
            ? "\u2717" // x
            : "";

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"} mb-1`}>
      <div
        className={`max-w-[70%] px-3 py-2 rounded-2xl ${
          isOutbound
            ? "bg-primary-600 text-white rounded-br-md"
            : "bg-gray-800 text-gray-200 rounded-bl-md"
        }`}
      >
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        <div
          className={`flex items-center justify-end gap-1 mt-0.5 ${
            isOutbound ? "text-primary-200" : "text-gray-500"
          }`}
        >
          <span className="text-[10px]">{time}</span>
          {isOutbound && <span className="text-[10px]">{statusIcon}</span>}
        </div>
      </div>
    </div>
  );
}
