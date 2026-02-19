import React, { useState, useEffect, useRef } from "react";
import { useClientStore } from "../../stores/client-store";
import { useContactStore } from "../../stores/contact-store";

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

  // Balance state
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Send form state
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("0");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    type: "success" | "error";
    message: string;
    txnHash?: string;
  } | null>(null);

  // Contact picker state
  const contacts = useContactStore((s) => s.contacts);
  const loadContacts = useContactStore((s) => s.loadContacts);
  const [showContacts, setShowContacts] = useState(false);
  const contactPickerRef = useRef<HTMLDivElement>(null);

  // Echo test state
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

  useEffect(() => {
    loadContacts();
  }, []);

  // Close contact picker on click outside
  useEffect(() => {
    if (!showContacts) return;
    function handleClickOutside(e: MouseEvent) {
      if (contactPickerRef.current && !contactPickerRef.current.contains(e.target as Node)) {
        setShowContacts(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showContacts]);

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

  function handleMaxAmount() {
    if (balance === null) return;
    const balNum = parseFloat(balance);
    const feeNum = parseFloat(fee) || 0;
    const max = Math.max(0, balNum - feeNum);
    setAmount(max.toString());
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSendResult(null);

    // Client-side validation
    if (!toAddress.trim()) {
      setSendResult({ type: "error", message: "Please enter a recipient address" });
      return;
    }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setSendResult({ type: "error", message: "Amount must be greater than 0" });
      return;
    }
    const feeNum = parseFloat(fee);
    if (isNaN(feeNum) || feeNum < 0) {
      setSendResult({ type: "error", message: "Fee must be 0 or greater" });
      return;
    }
    if (balance !== null) {
      const balNum = parseFloat(balance);
      if (amountNum + feeNum > balNum) {
        setSendResult({
          type: "error",
          message: `Insufficient balance. Have ${balNum} NKN, need ${amountNum + feeNum} NKN`,
        });
        return;
      }
    }

    setSending(true);
    try {
      const result = await window.dchat.wallet.transfer(toAddress.trim(), amount, fee);
      setSendResult({
        type: "success",
        message: `Transfer sent!`,
        txnHash: result.txnHash,
      });
      setToAddress("");
      setAmount("");
      setFee("0");
      // Refresh balance after successful send
      if (walletAddress) {
        loadBalance(walletAddress);
      }
    } catch (err) {
      setSendResult({
        type: "error",
        message: err instanceof Error ? err.message : "Transfer failed",
      });
    } finally {
      setSending(false);
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
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 py-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold text-gray-200">Wallet</h2>
        <p className="text-xs text-gray-500 mt-0.5">Send, receive, and manage NKN tokens</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
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
                    <>
                      {balance} <span className="text-xs text-gray-500">NKN</span>
                    </>
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

        {/* Send Section */}
        {walletAddress && (
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-gray-300">Send NKN</h3>
            <form onSubmit={handleSend} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500">To Address</label>
                <div className="relative" ref={contactPickerRef}>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={toAddress}
                      onChange={(e) => setToAddress(e.target.value)}
                      placeholder="NKN wallet address"
                      className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-primary-500 font-mono"
                      disabled={sending}
                    />
                    {contacts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowContacts(!showContacts)}
                        disabled={sending}
                        className="flex-shrink-0 px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-50 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                        title="Pick from contacts"
                      >
                        Contacts
                      </button>
                    )}
                  </div>
                  {showContacts && (
                    <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg shadow-lg">
                      {contacts.map((c) => (
                        <button
                          key={c.address}
                          type="button"
                          onClick={async () => {
                            setShowContacts(false);
                            try {
                              const walletAddr = await window.dchat.wallet.addressFromClient(c.address);
                              setToAddress(walletAddr);
                            } catch {
                              setToAddress(c.address);
                            }
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors"
                        >
                          <div className="text-sm text-gray-200 truncate">{c.name || c.address}</div>
                          {c.name && (
                            <div className="text-xs text-gray-500 font-mono truncate">{c.address}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs text-gray-500">Amount</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      min="0"
                      step="any"
                      className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-primary-500"
                      disabled={sending}
                    />
                    <button
                      type="button"
                      onClick={handleMaxAmount}
                      disabled={balance === null || sending}
                      className="px-3 py-2.5 text-xs rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-50 text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      MAX
                    </button>
                  </div>
                </div>

                <div className="w-28 space-y-1.5">
                  <label className="text-xs text-gray-500">Fee</label>
                  <input
                    type="number"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    min="0"
                    max="10"
                    step="any"
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-primary-500"
                    disabled={sending}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={sending || !toAddress.trim() || !amount}
                className="px-5 py-2.5 text-sm rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
              >
                {sending ? "Sending..." : "Send"}
              </button>

              {sendResult && (
                <div
                  className={`px-3 py-2.5 rounded-lg text-sm break-all ${
                    sendResult.type === "success"
                      ? "bg-green-900/30 border border-green-800 text-green-300"
                      : "bg-red-900/30 border border-red-800 text-red-300"
                  }`}
                >
                  {sendResult.type === "success" && sendResult.txnHash ? (
                    <>
                      Transfer sent! Txn:{" "}
                      <a
                        href={`https://nscan.io/transactions/${sendResult.txnHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-green-200"
                      >
                        {sendResult.txnHash}
                      </a>
                    </>
                  ) : (
                    sendResult.message
                  )}
                </div>
              )}
            </form>
          </section>
        )}

        {/* Receive Section */}
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-gray-300">Receive</h3>

          {walletAddress && (
            <CopyableField label="NKN Wallet Address" value={walletAddress} />
          )}

          {nknAddress && (
            <CopyableField label="D-Chat ID (NKN Client Address)" value={nknAddress} />
          )}

          {!nknAddress && !walletAddress && (
            <p className="text-sm text-gray-500">Not connected</p>
          )}
        </section>

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
