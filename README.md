# D-Chat Desktop

Decentralized, end-to-end encrypted desktop messenger built on the [NKN](https://nkn.org/) (New Kind of Network) relay network.

D-Chat Desktop is an Electron port of [nMobile](https://github.com/nknorg/nMobile), bringing private, serverless messaging to macOS, Windows, and Linux.

## How It Works

D-Chat sends messages through NKN's decentralized relay network of ~100,000 nodes. No central server ever sees your messages or metadata.

- **Your identity is a cryptographic key pair.** No phone number, no email, no password. A wallet is generated on first launch and the private key never leaves your device.
- **Messages are end-to-end encrypted** using NKN's built-in encryption. Only the sender and recipient can read them.
- **All local data is encrypted at rest** using SQLCipher (AES-256 encrypted SQLite), keyed to your wallet seed.

```
You ──(encrypted)──► NKN Relay Network ──(encrypted)──► Recipient
         No central server. No metadata leakage.
```

## Features

### Available Now
- **NKN wallet management** — Create new wallet, import from keystore JSON, restore saved wallet
- **1-to-1 messaging** — Send/receive encrypted text messages over NKN relay network
- **Contact management** — Add contacts by NKN address, auto-create contacts for unknown senders
- **Conversation threads** — Session list with last message preview and unread badges
- **Message status** — Sending/sent/failed indicators on outbound messages
- **Persistent storage** — SQLite database for message history, contacts, sessions, and settings
- **Connection management** — Connect/disconnect with status indicator (green/yellow/red)
- **Auth gate** — Login page when disconnected, full app when connected
- **Dark theme UI** — Tailwind CSS dark theme with chat bubbles, session list, and contact management
- Hot-reload development environment

### Coming Soon
- **Encrypted local storage** — SQLCipher database encryption (key derived from wallet seed)
- **Message receipts** — Delivered and read status tracking
- **NKN wallet UI** — Balance display, send/receive NKN tokens
- **Group chat** — Public topics (on-chain) and private groups (signature-based)
- **Media sharing** — Images, files, audio, video via IPFS
- **Burn-after-read** — Self-destructing messages
- **Desktop notifications** — Native OS notifications for new messages

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- npm (included with Node.js)

### Install and Run

```bash
# Clone the repository
git clone <repo-url> dchat
cd dchat

# Install dependencies
npm install

# Rebuild native modules (better-sqlite3) for Electron
npx electron-rebuild

# Start in development mode (hot reload)
npm run dev
```

The app will open an Electron window. On first launch you'll see the Login page — create a new wallet with a password to connect to the NKN network.

### Build for Production

```bash
# Full production build
npm run build

# Package as distributable (dmg/nsis/AppImage)
npm run package
```

## Development

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev mode — Vite hot reload + Electron |
| `npm run build` | Production build (main + preload + renderer) |
| `npm run package` | Build and package with electron-builder |
| `npm run test` | Run unit tests with Vitest |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Check code with ESLint |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run typecheck` | TypeScript type checking |

### Project Structure

```
src/
├── main/              Electron main process
│   ├── index.ts         App entry — DB init, services, IPC registration
│   ├── services/        Business logic
│   │   ├── nkn-client-service.ts   NKN MultiClient wrapper
│   │   ├── chat-service.ts         Send/receive message orchestration
│   │   ├── contact-service.ts      Contact CRUD
│   │   └── session-service.ts      Session CRUD
│   ├── db/              SQLite database layer
│   │   ├── database.ts             Singleton (init/get/close, WAL, FK)
│   │   ├── migrations/             Version-based schema migrations
│   │   └── repositories/           One repository per entity
│   ├── ipc/             IPC handler registration (one file per domain)
│   └── crypto/          Encryption utilities (planned)
├── renderer/          React UI (runs in browser context)
│   ├── App.tsx          Auth gate + sidebar nav + page routing
│   ├── pages/           Login, Chat (two-panel), Contacts
│   ├── components/      Chat bubbles, session list, message input, status
│   ├── stores/          Zustand stores (client, chat, contact, session)
│   └── hooks/           IPC push-event subscriptions
├── shared/            Code shared between main and renderer
│   ├── types/           TypeScript interfaces (Message, Contact, Session, etc.)
│   ├── constants.ts     App constants, NKN seed servers
│   └── ipc-channels.ts  IPC channel definitions + push channels
└── preload/           Electron preload (contextBridge)
    └── index.ts         Typed window.dchat API with push listeners
```

### Architecture

D-Chat follows Electron's recommended security model with strict process separation:

- **Main process** handles all privileged operations: NKN networking, database access, cryptography, and file I/O.
- **Renderer process** is a sandboxed React app with no direct access to Node.js APIs.
- **Preload script** bridges the two via `contextBridge`, exposing a typed `window.dchat` API.

Context isolation is enabled and `nodeIntegration` is disabled — the renderer communicates with the main process exclusively through IPC.

### Tech Stack

| Layer | Technology |
|---|---|
| Desktop runtime | Electron |
| UI | React, TypeScript, Tailwind CSS |
| State management | Zustand |
| Networking | nkn-sdk (NKN JavaScript SDK) |
| Database | better-sqlite3 (SQLCipher planned) |
| Crypto | Node.js crypto (AES-256-GCM planned), tweetnacl-js (planned) |
| Bundler | Vite (renderer), tsc (main/preload) |
| Packaging | electron-builder |
| Testing | Vitest, Playwright |

## NKN Network

[NKN](https://nkn.org/) (New Kind of Network) is a decentralized data relay network with ~100,000 nodes worldwide. Key properties:

- **No central server** — Messages are routed through multiple relay nodes; no single node sees the full path or content.
- **End-to-end encryption** — Built into the NKN SDK. Messages are encrypted with the recipient's public key before leaving the sender's device.
- **Censorship resistant** — No single point of failure or control. The network is permissionless.
- **Blockchain-backed** — NKN uses its own blockchain for node incentives and pub/sub topic subscriptions.

Each user's identity is an NKN address derived from their public key (e.g., `a1b2c3...`). Contacts are added by exchanging these addresses.

## Security Model

| Threat | Mitigation |
|---|---|
| Server compromise | No server. All messages relay through decentralized NKN nodes. |
| Message interception | End-to-end encryption (NKN SDK). Relay nodes cannot decrypt messages. |
| Local data theft | SQLCipher encrypts the entire database (AES-256). Key derived from wallet seed. |
| Key extraction | Private keys stored via Electron's `safeStorage` (OS keychain). |
| Renderer exploitation | Context isolation enabled, nodeIntegration disabled. Renderer has no Node.js access. |
| Metadata leakage | NKN's onion-like routing obscures sender/recipient from relay nodes. |

## Roadmap

| Phase | Focus | Status |
|---|---|---|
| 1 | Foundation — NKN client, 1-to-1 messaging, contacts, SQLite DB | Complete |
| 2 | Rich messaging — Receipts, media, IPFS, burn-after-read, SQLCipher encryption | Planned |
| 3 | Group chat — Public topics, private groups | Planned |
| 4 | Wallet & polish — NKN/ETH wallets, multi-device sync, notifications | Planned |

## Acknowledgments

- [nMobile](https://github.com/nknorg/nMobile) — The original mobile messenger this project is ported from
- [NKN](https://nkn.org/) — The decentralized relay network powering all messaging
- Dr. Whitfield Diffie — Co-creator of public key cryptography, who advised the nMobile project

## License

MIT
