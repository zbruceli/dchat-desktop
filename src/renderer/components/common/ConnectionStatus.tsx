import React from "react";
import { useClientStore } from "../../stores/client-store";

export function ConnectionStatus() {
  const status = useClientStore((s) => s.status);

  const dotColor =
    status.state === "connected"
      ? "bg-green-500"
      : status.state === "connecting"
        ? "bg-yellow-500 animate-pulse"
        : "bg-red-500";

  const label =
    status.state === "connected"
      ? status.address
        ? status.address.substring(0, 8) + "..."
        : "Connected"
      : status.state === "connecting"
        ? "Connecting..."
        : "Disconnected";

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5" title={status.address ?? ""}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
      <span className="text-[10px] text-gray-400 truncate">{label}</span>
    </div>
  );
}
