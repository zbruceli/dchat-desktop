import React, { useState, useRef, useEffect } from "react";
import { useClientStore } from "../../stores/client-store";

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-1">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="flex items-center gap-1.5">
        <div className="flex-1 min-w-0 px-2 py-1.5 bg-gray-800 rounded text-[11px] text-gray-300 font-mono truncate select-all">
          {value}
        </div>
        <button
          onClick={handleCopy}
          className="flex-shrink-0 px-2 py-1.5 text-[10px] rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
          title="Copy to clipboard"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function EchoTest() {
  const echoTest = useClientStore((s) => s.echoTest);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; rtt: number; error?: string } | null>(null);

  async function handleTest() {
    setTesting(true);
    setResult(null);
    try {
      const res = await echoTest();
      setResult(res);
    } catch (err) {
      setResult({ success: false, rtt: -1, error: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">Network Test</div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="px-3 py-1.5 text-[11px] rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 transition-colors"
        >
          {testing ? "Testing..." : "Echo Test"}
        </button>
        {result && (
          <span className={`text-[11px] ${result.success ? "text-green-400" : "text-red-400"}`}>
            {result.success ? `OK (${result.rtt}ms)` : result.error}
          </span>
        )}
      </div>
    </div>
  );
}

export function ConnectionStatus() {
  const status = useClientStore((s) => s.status);
  const walletAddress = useClientStore((s) => s.walletAddress);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

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

  const isConnected = status.state === "connected";

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => isConnected && setOpen(!open)}
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded transition-colors ${
          isConnected ? "hover:bg-gray-800 cursor-pointer" : "cursor-default"
        }`}
        title={isConnected ? "Click to view addresses" : status.state}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="text-[10px] text-gray-400 truncate">{label}</span>
      </button>

      {open && isConnected && (
        <div className="absolute bottom-full left-0 mb-2 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3 space-y-3 z-50">
          <div className="text-xs font-semibold text-gray-300">Your Identity</div>

          {status.address && (
            <CopyableField label="D-Chat ID (NKN Address)" value={status.address} />
          )}

          {walletAddress && (
            <CopyableField label="Wallet Address" value={walletAddress} />
          )}

          <EchoTest />
        </div>
      )}
    </div>
  );
}
