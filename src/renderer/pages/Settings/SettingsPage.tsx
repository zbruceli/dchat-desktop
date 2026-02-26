import React, { useState, useEffect } from "react";
import { useProfileStore } from "../../stores/profile-store";
import { CopyableField } from "../../components/common/CopyableField";

interface IpfsConfig {
  gateways?: { host: string; port: number; protocol: string; authHeader?: string }[];
}

function ProfileSection() {
  const profile = useProfileStore((s) => s.profile);
  const loadProfile = useProfileStore((s) => s.loadProfile);
  const setNickname = useProfileStore((s) => s.setNickname);
  const pickAndSetAvatar = useProfileStore((s) => s.pickAndSetAvatar);
  const [nicknameValue, setNicknameValue] = useState("");
  const [nicknameSaved, setNicknameSaved] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (profile) {
      setNicknameValue(profile.nickname);
    }
  }, [profile]);

  async function handleSaveNickname() {
    const trimmed = nicknameValue.trim();
    if (trimmed !== (profile?.nickname || "")) {
      await setNickname(trimmed);
    }
    setNicknameSaved(true);
    setTimeout(() => setNicknameSaved(false), 2000);
  }

  const avatarSrc = profile?.avatarPath
    ? `dchat-media://profile-cache/${profile.avatarPath}?v=${profile.profileVersion}`
    : null;

  const initials = profile?.nickname
    ? profile.nickname.charAt(0).toUpperCase()
    : "?";

  return (
    <section className="max-w-lg mb-8">
      <h2 className="text-sm font-medium text-text-secondary mb-4">Profile</h2>

      <div className="flex items-start gap-4 mb-4">
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-20 h-20 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden bg-accent-700 text-white text-2xl font-semibold cursor-pointer hover:opacity-80 transition-opacity"
            onClick={pickAndSetAvatar}
            title="Click to change avatar"
          >
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <button
            onClick={pickAndSetAvatar}
            className="text-[11px] text-accent-400 hover:text-accent-500 transition-colors"
          >
            Change
          </button>
        </div>

        <div className="flex-1">
          <label className="block mb-4">
            <span className="text-xs text-text-muted mb-1 block">Nickname</span>
            <input
              type="text"
              value={nicknameValue}
              onChange={(e) => setNicknameValue(e.target.value)}
              onBlur={handleSaveNickname}
              onKeyDown={(e) => e.key === "Enter" && handleSaveNickname()}
              placeholder="Set your display name"
              maxLength={64}
              className="w-full px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-sm text-text-primary placeholder-text-faint focus:outline-none focus:border-accent-500/50"
            />
          </label>
          {nicknameSaved && (
            <span className="text-[11px] text-green-400">Saved!</span>
          )}
          {profile?.profileVersion && (
            <div className="text-[10px] text-text-faint mt-2">
              Profile version: {profile.profileVersion.substring(0, 8)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function NotificationsSection() {
  const [muted, setMuted] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    window.dchat.settings
      .get("notifications_muted")
      .then((value) => {
        if (value === true) setMuted(true);
      })
      .catch(console.error)
      .finally(() => setLoaded(true));
  }, []);

  async function handleToggle() {
    const newValue = !muted;
    setMuted(newValue);
    await window.dchat.settings.set("notifications_muted", newValue);
  }

  if (!loaded) return null;

  return (
    <section className="max-w-lg mb-8">
      <h2 className="text-sm font-medium text-text-secondary mb-4">Notifications</h2>
      <label className="flex items-center gap-3 cursor-pointer">
        <div
          onClick={handleToggle}
          className={`relative w-10 h-5 rounded-full transition-colors ${
            muted ? "bg-red-500/60" : "bg-surface-border"
          }`}
        >
          <div
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              muted ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </div>
        <span className="text-sm text-text-primary">Mute all notifications</span>
      </label>
      <p className="text-[11px] text-text-faint mt-2">
        When enabled, no desktop notifications will be shown for any conversation.
        You can also mute individual conversations from the session list.
      </p>
    </section>
  );
}

function WalletBackupSection() {
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function handleExport() {
    setStatus(null);
    try {
      const result = await window.dchat.wallet.exportKeystore();
      if (result.success) {
        setStatus({ type: "success", message: `Exported to ${result.filePath}` });
        setTimeout(() => setStatus(null), 4000);
      }
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Export failed" });
    }
  }

  return (
    <section className="max-w-lg mb-8">
      <h2 className="text-sm font-medium text-text-secondary mb-4">Wallet Backup</h2>
      <p className="text-xs text-text-muted mb-4">
        Export your wallet keystore file for safekeeping. You can use it to restore your wallet
        and recover all previous conversations on any device.
      </p>

      <button
        onClick={handleExport}
        className="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm font-medium transition-colors"
      >
        Export Wallet Keystore
      </button>

      {status && (
        <p className={`mt-2 text-xs ${status.type === "success" ? "text-green-400" : "text-red-400"}`}>
          {status.message}
        </p>
      )}

      <p className="mt-3 text-[11px] text-text-faint">
        Keep this file safe. Anyone with the keystore and password can access your wallet.
      </p>
    </section>
  );
}

function DatabaseBackupSection() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    if (!password.trim()) {
      setStatus({ type: "error", message: "Enter your wallet password" });
      return;
    }
    setStatus(null);
    setLoading(true);
    try {
      const result = await window.dchat.database.export(password);
      if (result.success) {
        setStatus({ type: "success", message: `Exported to ${result.filePath}` });
        setTimeout(() => setStatus(null), 4000);
      }
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Export failed" });
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore() {
    if (!password.trim()) {
      setStatus({ type: "error", message: "Enter your wallet password" });
      return;
    }
    const confirmed = window.confirm(
      "Restoring will replace all current messages, contacts, and group data. The app will restart. Continue?",
    );
    if (!confirmed) return;

    setStatus(null);
    setLoading(true);
    try {
      await window.dchat.database.restore(password);
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Restore failed" });
      setLoading(false);
    }
  }

  return (
    <section className="max-w-lg mb-8">
      <h2 className="text-sm font-medium text-text-secondary mb-4">Database Backup</h2>
      <p className="text-xs text-text-muted mb-4">
        Export or restore your message history, contacts, and group data. The backup is encrypted
        with your wallet password.
      </p>

      <label className="block mb-4">
        <span className="text-xs text-text-muted mb-1 block">Wallet Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your wallet password"
          className="w-full px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-sm text-text-primary placeholder-text-faint focus:outline-none focus:border-accent-500/50"
        />
      </label>

      <div className="flex gap-3">
        <button
          onClick={handleExport}
          disabled={loading}
          className="px-4 py-2 bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? "Working..." : "Export Database"}
        </button>
        <button
          onClick={handleRestore}
          disabled={loading}
          className="px-4 py-2 bg-surface-raised hover:bg-surface-border border border-surface-border text-text-primary rounded-lg text-sm font-medium transition-colors"
        >
          Restore Database
        </button>
      </div>

      {status && (
        <p className={`mt-2 text-xs ${status.type === "success" ? "text-green-400" : "text-red-400"}`}>
          {status.message}
        </p>
      )}

      <p className="mt-3 text-[11px] text-text-faint">
        Warning: Restoring a backup will replace all current messages and contacts. The app will restart.
      </p>
    </section>
  );
}

interface BotWalletInfo {
  publicKey: string;
  walletAddress: string;
  seed: string;
}

function NknBotSection() {
  const [bot, setBot] = useState<BotWalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [seedCopied, setSeedCopied] = useState(false);

  useEffect(() => {
    window.dchat.bot
      .get()
      .then((info) => setBot(info))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    setCreating(true);
    try {
      const info = await window.dchat.bot.create();
      setBot(info);
      setShowSeed(false);
    } catch (err) {
      console.error("Failed to create bot wallet:", err);
    } finally {
      setCreating(false);
    }
  }

  async function handleRegenerate() {
    const confirmed = window.confirm(
      "This will destroy the current bot wallet and generate a new one. The old bot credentials will stop working. Continue?",
    );
    if (!confirmed) return;
    await handleCreate();
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      "Delete the bot wallet? Any bots using these credentials will stop working.",
    );
    if (!confirmed) return;
    try {
      await window.dchat.bot.delete();
      setBot(null);
      setShowSeed(false);
    } catch (err) {
      console.error("Failed to delete bot wallet:", err);
    }
  }

  async function handleCopySeed() {
    if (!bot) return;
    await navigator.clipboard.writeText(bot.seed);
    setSeedCopied(true);
    setTimeout(() => setSeedCopied(false), 1500);
  }

  if (loading) return null;

  return (
    <section className="max-w-lg mb-8">
      <h2 className="text-sm font-medium text-text-secondary mb-4">NKN Bot</h2>
      <p className="text-xs text-text-muted mb-4">
        Generate a standalone NKN wallet for use as a bot. Copy the credentials into your bot code.
        The bot is not connected from within D-Chat.
      </p>

      {!bot ? (
        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-4 py-2 bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {creating ? "Creating..." : "Create Bot Wallet"}
        </button>
      ) : (
        <div className="space-y-3">
          <CopyableField label="D-Chat ID (Public Key)" value={bot.publicKey} />
          <CopyableField label="Wallet Address" value={bot.walletAddress} />

          {/* Seed field with show/hide */}
          <div className="space-y-1">
            <div className="text-[10px] text-text-muted uppercase tracking-wide">Seed</div>
            <div className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0 px-2 py-1.5 bg-surface-raised rounded text-[11px] text-text-secondary font-mono truncate select-all">
                {showSeed ? bot.seed : "\u2022".repeat(32)}
              </div>
              <button
                onClick={() => setShowSeed(!showSeed)}
                className="flex-shrink-0 px-2 py-1.5 text-[10px] rounded bg-surface-raised hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
              >
                {showSeed ? "Hide" : "Show"}
              </button>
              <button
                onClick={handleCopySeed}
                className="flex-shrink-0 px-2 py-1.5 text-[10px] rounded bg-surface-raised hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
              >
                {seedCopied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleRegenerate}
              disabled={creating}
              className="px-4 py-2 bg-surface-raised hover:bg-surface-border border border-surface-border text-text-primary rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {creating ? "Creating..." : "Regenerate"}
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors"
            >
              Delete
            </button>
          </div>

          <p className="text-[11px] text-text-faint">
            Keep the seed secret. Anyone with the seed can impersonate this bot.
          </p>
        </div>
      )}
    </section>
  );
}

export function SettingsPage() {
  const [gatewayHost, setGatewayHost] = useState("64.225.88.71");
  const [gatewayPort, setGatewayPort] = useState("80");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.dchat.settings
      .get("ipfs_config")
      .then((value) => {
        if (value) {
          const config = value as IpfsConfig;
          if (config.gateways && config.gateways.length > 0) {
            setGatewayHost(config.gateways[0].host || "64.225.88.71");
            setGatewayPort(String(config.gateways[0].port || 80));
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    const config: IpfsConfig = {
      gateways: [
        {
          host: gatewayHost.trim() || "64.225.88.71",
          port: parseInt(gatewayPort.trim(), 10) || 80,
          protocol: "http:",
        },
      ],
    };
    await window.dchat.settings.set("ipfs_config", config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-text-muted">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-xl font-semibold text-text-primary mb-6">Settings</h1>

      <ProfileSection />

      <NotificationsSection />

      <WalletBackupSection />

      <DatabaseBackupSection />

      <NknBotSection />

      <section className="max-w-lg">
        <h2 className="text-sm font-medium text-text-secondary mb-4">IPFS Configuration</h2>
        <p className="text-xs text-text-muted mb-4">
          Configure the IPFS gateway for image storage. By default, D-Chat uses the same
          IPFS node as nMobile (no authentication required).
        </p>

        <label className="block mb-4">
          <span className="text-xs text-text-muted mb-1 block">IPFS Gateway Host</span>
          <input
            type="text"
            value={gatewayHost}
            onChange={(e) => setGatewayHost(e.target.value)}
            placeholder="64.225.88.71"
            className="w-full px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-sm text-text-primary placeholder-text-faint focus:outline-none focus:border-accent-500/50"
          />
        </label>

        <label className="block mb-6">
          <span className="text-xs text-text-muted mb-1 block">Port</span>
          <input
            type="text"
            value={gatewayPort}
            onChange={(e) => setGatewayPort(e.target.value)}
            placeholder="80"
            className="w-full px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-sm text-text-primary placeholder-text-faint focus:outline-none focus:border-accent-500/50"
          />
        </label>

        <button
          onClick={handleSave}
          className="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {saved ? "Saved!" : "Save"}
        </button>
      </section>
    </div>
  );
}
