import React, { useState, useEffect } from "react";
import { useClientStore } from "../../stores/client-store";

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs text-gray-500 uppercase tracking-wide">{label}</label>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 font-mono break-all select-all">
          {value}
        </div>
        <button
          onClick={handleCopy}
          className="flex-shrink-0 px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          title="Copy to clipboard"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function WalletPage() {
  const status = useClientStore((s) => s.status);
  const walletAddress = useClientStore((s) => s.walletAddress);
  const echoTest = useClientStore((s) => s.echoTest);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [echoTesting, setEchoTesting] = useState(false);
  const [echoResult, setEchoResult] = useState<{
    success: boolean;
    rtt: number;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (walletAddress) {
      loadBalance(walletAddress);
    }
  }, [walletAddress]);

  async function loadBalance(address: string) {
    setBalanceLoading(true);
    try {
      const bal = await window.dchat.wallet.getBalance(address);
      setBalance(bal);
    } catch {
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }

  async function handleEchoTest() {
    setEchoTesting(true);
    setEchoResult(null);
    try {
      const res = await echoTest();
      setEchoResult(res);
    } catch (err) {
      setEchoResult({
        success: false,
        rtt: -1,
        error: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setEchoTesting(false);
    }
  }

  const nknAddress = status.state === "connected" ? status.address : null;

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-6 py-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold text-gray-200">Wallet</h2>
        <p className="text-xs text-gray-500 mt-0.5">Your NKN identity and wallet information</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Identity Section */}
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-gray-300">Identity</h3>

          {nknAddress && (
            <CopyableField label="D-Chat ID (NKN Client Address)" value={nknAddress} />
          )}

          {walletAddress && (
            <CopyableField label="NKN Wallet Address" value={walletAddress} />
          )}

          {!nknAddress && !walletAddress && (
            <p className="text-sm text-gray-500">Not connected</p>
          )}
        </section>

        {/* Balance Section */}
        {walletAddress && (
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-gray-300">Balance</h3>
            <div className="flex items-center gap-3">
              <div className="px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">NKN Balance</div>
                <div className="text-lg font-semibold text-gray-200">
                  {balanceLoading ? (
                    <span className="text-gray-500 text-sm">Loading...</span>
                  ) : balance !== null ? (
                    <>{balance} <span className="text-xs text-gray-500">NKN</span></>
                  ) : (
                    <span className="text-gray-500 text-sm">Unavailable</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => walletAddress && loadBalance(walletAddress)}
                disabled={balanceLoading}
                className="px-3 py-2 text-xs rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-50 text-gray-400 hover:text-gray-200 transition-colors"
              >
                Refresh
              </button>
            </div>
          </section>
        )}

        {/* Network Test Section */}
        {nknAddress && (
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-gray-300">Network</h3>
            <div className="flex items-center gap-3">
              <button
                onClick={handleEchoTest}
                disabled={echoTesting}
                className="px-4 py-2.5 text-sm rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium transition-colors"
              >
                {echoTesting ? "Testing..." : "Run Echo Test"}
              </button>
              {echoResult && (
                <div
                  className={`px-3 py-2 rounded-lg text-sm ${
                    echoResult.success
                      ? "bg-green-900/30 border border-green-800 text-green-300"
                      : "bg-red-900/30 border border-red-800 text-red-300"
                  }`}
                >
                  {echoResult.success
                    ? `Success - round trip: ${echoResult.rtt}ms`
                    : `Failed: ${echoResult.error}`}
                </div>
              )}
            </div>
            <p className="text-[11px] text-gray-600">
              Sends a message to your own NKN address to verify P2P connectivity.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
