import React, { useState } from "react";
import { useClientStore } from "../../stores/client-store";

export function LoginPage() {
  const [mode, setMode] = useState<"create" | "import">("create");
  const [password, setPassword] = useState("");
  const [keystore, setKeystore] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useClientStore((s) => s.connect);

  async function handleCreate() {
    if (!password) {
      setError("Password is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const wallet = await window.dchat.wallet.create(password);
      // Store keystore for future sessions
      await window.dchat.settings.set("keystore", wallet.keystore);
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
      await connect(wallet.seed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wrong password or corrupted keystore");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-sm p-6">
        <h1 className="text-2xl font-bold text-gray-100 mb-1 text-center">D-Chat Desktop</h1>
        <p className="text-sm text-gray-500 mb-6 text-center">Decentralized encrypted messaging</p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-1 mb-4 p-1 bg-gray-800 rounded-lg">
          <button
            onClick={() => setMode("create")}
            className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
              mode === "create" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-300"
            }`}
          >
            New Wallet
          </button>
          <button
            onClick={() => setMode("import")}
            className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
              mode === "import" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-300"
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
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-primary-500 text-sm"
            disabled={loading}
          />

          {mode === "import" && (
            <textarea
              placeholder="Paste NKN keystore JSON..."
              value={keystore}
              onChange={(e) => setKeystore(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-primary-500 text-sm resize-none font-mono"
              disabled={loading}
            />
          )}

          <div className="flex flex-col gap-2">
            {mode === "create" ? (
              <>
                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="w-full py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {loading ? "Creating..." : "Create New Wallet"}
                </button>
                <button
                  onClick={handleRestore}
                  disabled={loading}
                  className="w-full py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 rounded-lg text-sm transition-colors"
                >
                  {loading ? "Restoring..." : "Restore Saved Wallet"}
                </button>
              </>
            ) : (
              <button
                onClick={handleImport}
                disabled={loading}
                className="w-full py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
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
