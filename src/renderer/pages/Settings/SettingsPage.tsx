import React, { useState, useEffect } from "react";
import { useProfileStore } from "../../stores/profile-store";

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

      <WalletBackupSection />

      <DatabaseBackupSection />

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
