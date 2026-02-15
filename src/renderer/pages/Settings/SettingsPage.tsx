import React, { useState, useEffect } from "react";

interface IpfsConfig {
  gateways?: { host: string; port: number; protocol: string; authHeader?: string }[];
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
        <p className="text-sm text-gray-500">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-xl font-semibold text-gray-200 mb-6">Settings</h1>

      <section className="max-w-lg">
        <h2 className="text-sm font-medium text-gray-300 mb-4">IPFS Configuration</h2>
        <p className="text-xs text-gray-500 mb-4">
          Configure the IPFS gateway for image storage. By default, D-Chat uses the same
          IPFS node as nMobile (no authentication required).
        </p>

        <label className="block mb-4">
          <span className="text-xs text-gray-400 mb-1 block">IPFS Gateway Host</span>
          <input
            type="text"
            value={gatewayHost}
            onChange={(e) => setGatewayHost(e.target.value)}
            placeholder="64.225.88.71"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-primary-500"
          />
        </label>

        <label className="block mb-6">
          <span className="text-xs text-gray-400 mb-1 block">Port</span>
          <input
            type="text"
            value={gatewayPort}
            onChange={(e) => setGatewayPort(e.target.value)}
            placeholder="80"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-primary-500"
          />
        </label>

        <button
          onClick={handleSave}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {saved ? "Saved!" : "Save"}
        </button>
      </section>
    </div>
  );
}
