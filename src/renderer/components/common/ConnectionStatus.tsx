import React, { useState, useRef, useEffect } from "react";
import { useClientStore } from "../../stores/client-store";
import { useProfileStore } from "../../stores/profile-store";

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

function AvatarCircle({ size, onClick }: { size: number; onClick?: () => void }) {
  const profile = useProfileStore((s) => s.profile);
  const nickname = profile?.nickname || "";
  const avatarPath = profile?.avatarPath;

  const initials = nickname
    ? nickname.charAt(0).toUpperCase()
    : "?";

  // Add cache-bust query param using profileVersion to force reload after avatar change
  const avatarSrc = avatarPath
    ? `dchat-media://profile-cache/${avatarPath}?v=${profile?.profileVersion || ""}`
    : null;

  const sizeClass = size <= 32
    ? "w-8 h-8 text-xs"
    : size <= 48
      ? "w-12 h-12 text-base"
      : "w-16 h-16 text-xl";

  return (
    <div
      className={`${sizeClass} rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden bg-primary-700 text-white font-semibold ${onClick ? "cursor-pointer hover:opacity-80" : ""}`}
      onClick={onClick}
      title={onClick ? "Change avatar" : undefined}
    >
      {avatarSrc ? (
        <img
          src={avatarSrc}
          alt="Avatar"
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
            (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
          }}
        />
      ) : null}
      <span className={avatarSrc ? "hidden" : ""}>{initials}</span>
    </div>
  );
}

export function ConnectionStatus() {
  const status = useClientStore((s) => s.status);
  const walletAddress = useClientStore((s) => s.walletAddress);
  const profile = useProfileStore((s) => s.profile);
  const loadProfile = useProfileStore((s) => s.loadProfile);
  const setNickname = useProfileStore((s) => s.setNickname);
  const pickAndSetAvatar = useProfileStore((s) => s.pickAndSetAvatar);
  const [open, setOpen] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const nicknameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingNickname(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  useEffect(() => {
    if (editingNickname && nicknameInputRef.current) {
      nicknameInputRef.current.focus();
    }
  }, [editingNickname]);

  const dotColor =
    status.state === "connected"
      ? "bg-green-500"
      : status.state === "connecting"
        ? "bg-yellow-500 animate-pulse"
        : "bg-red-500";

  const displayName = profile?.nickname || (status.address ? status.address.substring(0, 8) + "..." : "");

  const isConnected = status.state === "connected";

  function startEditNickname() {
    setNicknameInput(profile?.nickname || "");
    setEditingNickname(true);
  }

  async function saveNickname() {
    setEditingNickname(false);
    const trimmed = nicknameInput.trim();
    if (trimmed !== (profile?.nickname || "")) {
      await setNickname(trimmed);
    }
  }

  function handleNicknameKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      saveNickname();
    } else if (e.key === "Escape") {
      setEditingNickname(false);
    }
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => isConnected && setOpen(!open)}
        className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded transition-colors ${
          isConnected ? "hover:bg-gray-800 cursor-pointer" : "cursor-default"
        }`}
        title={isConnected ? "Click to view profile" : status.state}
      >
        <div className="relative">
          <AvatarCircle size={32} />
          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-sidebar-bg ${dotColor}`} />
        </div>
        <span className="text-[10px] text-gray-400 truncate max-w-[56px]">{displayName}</span>
      </button>

      {open && isConnected && (
        <div className="absolute bottom-full left-0 mb-2 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3 space-y-3 z-50">
          <div className="text-xs font-semibold text-gray-300">Your Identity</div>

          {/* Avatar + Nickname editing */}
          <div className="flex items-center gap-3">
            <div className="relative group">
              <AvatarCircle size={64} onClick={pickAndSetAvatar} />
              <div
                className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                onClick={pickAndSetAvatar}
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              {editingNickname ? (
                <input
                  ref={nicknameInputRef}
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  onBlur={saveNickname}
                  onKeyDown={handleNicknameKeyDown}
                  placeholder="Set nickname"
                  maxLength={64}
                  className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-primary-500"
                />
              ) : (
                <div className="flex items-center gap-1.5 group/nick">
                  <span className="text-sm text-gray-200 truncate">
                    {profile?.nickname || "No nickname"}
                  </span>
                  <button
                    onClick={startEditNickname}
                    className="flex-shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
                    title="Edit nickname"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              )}
              <div className="text-[10px] text-gray-500 mt-0.5">
                {profile?.nickname ? "Nickname" : "Click pencil to set"}
              </div>
            </div>
          </div>

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
