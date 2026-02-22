import React, { useEffect, Component, type ErrorInfo, type ReactNode } from "react";
import { useClientStore } from "./stores/client-store";
import { useNavStore } from "./stores/nav-store";
import { useIpcSubscriptions } from "./hooks/use-ipc-subscriptions";
import { ConnectionStatus } from "./components/common/ConnectionStatus";
import { LoginPage } from "./pages/Login/LoginPage";
import { ChatPage } from "./pages/Chat/ChatPage";
import { ContactsPage } from "./pages/Contacts/ContactsPage";
import { WalletPage } from "./pages/Wallet/WalletPage";
import { SettingsPage } from "./pages/Settings/SettingsPage";
import { UserProfilePanel } from "./components/common/UserProfilePanel";

type NavItem = "chat" | "contacts" | "wallet" | "settings";

const NAV_ITEMS: { id: NavItem; label: string; icon: string }[] = [
  { id: "chat", label: "Chat", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  { id: "contacts", label: "Contacts", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  { id: "wallet", label: "Wallet", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
  { id: "settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

export function App() {
  const activeNav = useNavStore((s) => s.activeNav);
  const setActiveNav = useNavStore((s) => s.setActiveNav);
  const [appInfo, setAppInfo] = React.useState<{ name: string; version: string } | null>(null);
  const clientState = useClientStore((s) => s.status.state);
  const disconnect = useClientStore((s) => s.disconnect);

  const autoConnect = useClientStore((s) => s.autoConnect);

  useIpcSubscriptions();

  useEffect(() => {
    window.dchat?.app.getInfo().then(setAppInfo).catch(console.error);
    autoConnect();
  }, [autoConnect]);

  // Show login page if not connected
  if (clientState !== "connected") {
    return <LoginPage />;
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <nav className="flex flex-col w-14 bg-surface-deepest">
        <div className="flex-1 flex flex-col items-center pt-4 gap-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                activeNav === item.id
                  ? "bg-accent-500/20 text-white"
                  : "text-text-muted hover:bg-surface-hover/50 hover:text-text-primary"
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
            className="text-[10px] text-text-faint hover:text-red-400 transition-colors"
          >
            Disconnect
          </button>
          {appInfo && (
            <div className="mt-1 text-[10px] text-text-faint">
              v{appInfo.version}
            </div>
          )}
        </div>
      </nav>

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-h-0 min-w-0">
        <ErrorBoundary>
          <PageContent activeNav={activeNav} />
        </ErrorBoundary>
      </main>
      <UserProfilePanel />
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
      return <WalletPage />;
    case "settings":
      return <SettingsPage />;
  }
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-lg">
            <h2 className="text-lg font-semibold text-red-400 mb-2">Something went wrong</h2>
            <pre className="text-xs text-text-secondary bg-surface-raised p-4 rounded overflow-auto max-h-40 text-left">
              {this.state.error.message}{"\n"}{this.state.error.stack}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white text-sm rounded"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-text-primary mb-2">{title}</h1>
        <p className="text-text-muted">{description}</p>
      </div>
    </div>
  );
}
