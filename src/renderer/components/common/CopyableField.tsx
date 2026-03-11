import React, { useState } from "react";

export function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    (window as any).clipboardWriteText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-1">
      <div className="text-[10px] text-text-muted uppercase tracking-wide">{label}</div>
      <div className="flex items-center gap-1.5">
        <div className="flex-1 min-w-0 px-2 py-1.5 bg-surface-raised rounded text-[11px] text-text-secondary font-mono truncate select-all">
          {value}
        </div>
        <button
          onClick={handleCopy}
          className="flex-shrink-0 px-2 py-1.5 text-[10px] rounded bg-surface-raised hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
          title="Copy to clipboard"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
