import React, { useState } from "react";
import { useClientStore } from "../../stores/client-store";

export function LoginPage() {
  const [mode, setMode] = useState<"create" | "import">("create");
  const [password, setPassword] = useState("");
  const [keystore, setKeystore] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useClientStore((s) => s.connect);
  const setWalletAddress = useClientStore((s) => s.setWalletAddress);

  async function handleCreate() {
    if (!password) {
      setError("Password is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const wallet = await window.dchat.wallet.create(password);
      await window.dchat.settings.set("keystore", wallet.keystore);
      await window.dchat.wallet.saveSeed(wallet.seed, wallet.address);
      setWalletAddress(wallet.address);
      await connect(wallet.seed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create wallet");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!keystore || !password) {
      setError("Both keystore and password are required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const wallet = await window.dchat.wallet.import(keystore, password);
      await window.dchat.settings.set("keystore", wallet.keystore);
      await window.dchat.wallet.saveSeed(wallet.seed, wallet.address);
      setWalletAddress(wallet.address);
      await connect(wallet.seed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import wallet");
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore() {
    if (!password) {
      setError("Password is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const savedKeystore = (await window.dchat.settings.get("keystore")) as string | null;
      if (!savedKeystore) {
        setError("No saved wallet found. Create a new one or import.");
        setLoading(false);
        return;
      }
      const wallet = await window.dchat.wallet.import(savedKeystore, password);
      await window.dchat.wallet.saveSeed(wallet.seed, wallet.address);
      setWalletAddress(wallet.address);
      await connect(wallet.seed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wrong password or corrupted keystore");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-surface-deepest">
      <div className="w-full max-w-sm p-6 bg-surface-base rounded-xl border border-surface-border">
        <h1 className="text-2xl font-bold text-text-primary mb-1 text-center">D-Chat Desktop</h1>
        <p className="text-sm text-text-muted mb-6 text-center">Decentralized encrypted messaging</p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-1 mb-4 p-1 bg-surface-raised rounded-lg">
          <button
            onClick={() => setMode("create")}
            className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
              mode === "create" ? "bg-surface-hover text-text-primary" : "text-text-muted hover:text-text-secondary"
            }`}
          >
            New Wallet
          </button>
          <button
            onClick={() => setMode("import")}
            className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
              mode === "import" ? "bg-surface-hover text-text-primary" : "text-text-muted hover:text-text-secondary"
            }`}
          >
            Import
          </button>
        </div>

        <div className="space-y-3">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-text-primary placeholder-text-faint focus:outline-none focus:border-accent-500/50 text-sm"
            disabled={loading}
          />

          {mode === "import" && (
            <textarea
              placeholder="Paste NKN keystore JSON..."
              value={keystore}
              onChange={(e) => setKeystore(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-text-primary placeholder-text-faint focus:outline-none focus:border-accent-500/50 text-sm resize-none font-mono"
              disabled={loading}
            />
          )}

          <div className="flex flex-col gap-2">
            {mode === "create" ? (
              <>
                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="w-full py-2 bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {loading ? "Creating..." : "Create New Wallet"}
                </button>
                <button
                  onClick={handleRestore}
                  disabled={loading}
                  className="w-full py-2 bg-surface-hover hover:bg-surface-border disabled:opacity-50 text-text-secondary rounded-lg text-sm transition-colors"
                >
                  {loading ? "Restoring..." : "Restore Saved Wallet"}
                </button>
              </>
            ) : (
              <button
                onClick={handleImport}
                disabled={loading}
                className="w-full py-2 bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? "Importing..." : "Import Wallet"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
