import React, { useState, useEffect } from "react";
import { useClientStore } from "./stores/client-store";
import { useIpcSubscriptions } from "./hooks/use-ipc-subscriptions";
import { ConnectionStatus } from "./components/common/ConnectionStatus";
import { LoginPage } from "./pages/Login/LoginPage";
import { ChatPage } from "./pages/Chat/ChatPage";
import { ContactsPage } from "./pages/Contacts/ContactsPage";

type NavItem = "chat" | "contacts" | "wallet" | "settings";

const NAV_ITEMS: { id: NavItem; label: string; icon: string }[] = [
  { id: "chat", label: "Chat", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  { id: "contacts", label: "Contacts", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  { id: "wallet", label: "Wallet", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
  { id: "settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

export function App() {
  const [activeNav, setActiveNav] = useState<NavItem>("chat");
  const [appInfo, setAppInfo] = useState<{ name: string; version: string } | null>(null);
  const clientState = useClientStore((s) => s.status.state);
  const disconnect = useClientStore((s) => s.disconnect);

  useIpcSubscriptions();

  useEffect(() => {
    window.dchat?.app.getInfo().then(setAppInfo).catch(console.error);
  }, []);

  // Show login page if not connected
  if (clientState !== "connected") {
    return <LoginPage />;
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <nav className="flex flex-col w-16 bg-sidebar-bg border-r border-gray-800">
        <div className="flex-1 flex flex-col items-center pt-4 gap-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                activeNav === item.id
                  ? "bg-primary-600 text-white"
                  : "text-gray-400 hover:bg-sidebar-hover hover:text-gray-200"
              }`}
              title={item.label}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
              </svg>
            </button>
          ))}
        </div>
        <div className="flex flex-col items-center pb-2">
          <ConnectionStatus />
          <button
            onClick={disconnect}
            className="text-[10px] text-gray-500 hover:text-red-400 transition-colors"
          >
            Disconnect
          </button>
          {appInfo && (
            <div className="mt-1 text-[10px] text-gray-600">
              v{appInfo.version}
            </div>
          )}
        </div>
      </nav>

      {/* Main content area */}
      <main className="flex-1 flex flex-col">
        <PageContent activeNav={activeNav} />
      </main>
    </div>
  );
}

function PageContent({ activeNav }: { activeNav: NavItem }) {
  switch (activeNav) {
    case "chat":
      return <ChatPage />;
    case "contacts":
      return <ContactsPage />;
    case "wallet":
      return <PlaceholderPage title="Wallet" description="NKN wallet management — coming soon" />;
    case "settings":
      return <PlaceholderPage title="Settings" description="App configuration — coming soon" />;
  }
}

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-200 mb-2">{title}</h1>
        <p className="text-gray-500">{description}</p>
      </div>
    </div>
  );
}
