# D-Chat Desktop

Decentralized, end-to-end encrypted desktop messenger built on the [NKN](https://nkn.org/) (New Kind of Network) relay network.

D-Chat Desktop is an Electron port of [nMobile](https://github.com/nknorg/nMobile), bringing private, serverless messaging to macOS, Windows, and Linux.

## Downloads

Pre-built binaries for macOS, Windows, and Linux are available on the [Releases](../../releases) page.

> **Note:** Current releases are unsigned. macOS users need to right-click → Open (or run `xattr -cr` on the app). Windows users may see a SmartScreen warning — click "More info" → "Run anyway".

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
- **Image messaging** — Send/receive images encrypted with AES-128-GCM, stored on IPFS, fully interoperable with nMobile
- **Voice messaging** — Record voice messages (0.5s–60s), WebM/Opus converted to AAC-ADTS for nMobile compatibility, inline play/pause with progress bar
- **File sharing** — Send/receive any file type (up to 100 MB) encrypted via IPFS, click to open with system default app, nMobile-compatible
- **IPFS integration** — Encrypted upload/download via nMobile's IPFS nodes, multi-gateway fallback, configurable in Settings
- **Thumbnail preview** — 120x120 thumbnails uploaded separately to IPFS; receiver sees thumbnail immediately while full image downloads in background
- **Image viewer** — Click images to open full-screen lightbox, retry failed downloads
- **Contact management** — Add contacts by NKN address, auto-create contacts for unknown senders
- **Conversation threads** — Session list with last message preview and unread badges
- **Message receipts** — Delivered (gray ✓✓) and read (blue ✓✓) status on outbound messages, automatic delivery receipt on receive, read receipt on conversation open, nMobile-interoperable
- **Encrypted local storage** — SQLCipher database (AES-256) keyed to wallet seed; wallet data stored in `wallet.json` with safeStorage encryption
- **Connection management** — Connect/disconnect with status indicator (green/yellow/red)
- **Auth gate** — Login page when disconnected, full app when connected
- **Profile management** — Set nickname and avatar image, displayed in sidebar and Settings page, persisted across sessions
- **NKN wallet** — View balance, send NKN tokens to any address (with contact picker and auto client→wallet address conversion), receive section with copyable addresses, transaction links to [nscan.io](https://nscan.io)
- **Settings page** — Profile editing (nickname + avatar), notification mute toggle, and IPFS gateway configuration
- **Public topics (group chat)** — Create/join public topic groups via NKN blockchain subscriptions, subscriber management with side panel, leave with confirmation dialog, text/image/voice/file messaging, nMobile-compatible topic name hashing
- **Private groups** — Off-chain, signature-based membership groups with Ed25519 dual-signatures (inviter + invitee). Create groups, invite members from contact list, accept invitations, leave/kick with confirmation dialogs, member panel with permission badges (Owner/Admin/Normal), full member sync protocol, text/image/voice/file messaging, nMobile-interoperable
- **Desktop notifications** — Native OS notifications for incoming messages (1-to-1, topic, private group). Click to navigate to conversation. Suppressed when window is focused and viewing the relevant conversation.
- **Mute notifications** — Per-conversation mute toggle (bell icon on hover in session list) and global "Mute all notifications" toggle in Settings
- **Contact name resolution** — Contact names displayed throughout session list and message thread headers
- **Error boundary** — React error boundary catches rendering crashes and displays error details with retry
- **Chat bubble UI** — Outbound messages right-aligned with accent-colored bubbles, inbound messages left-aligned with avatar and surface-colored bubbles, dark theme with three-tone surface hierarchy, Tailwind CSS
- Hot-reload development environment

### Coming Soon
- **Video sharing** — Video media type via IPFS
- **Burn-after-read** — Self-destructing messages

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

# Rebuild native modules (better-sqlite3-multiple-ciphers, sharp) for Electron
npx electron-rebuild -f -w better-sqlite3-multiple-ciphers
npx electron-rebuild -f -w sharp

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
| `npm run package:mac` | Package for macOS (DMG + ZIP) |
| `npm run package:win` | Package for Windows (NSIS + portable) |
| `npm run package:linux` | Package for Linux (AppImage + DEB) |
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
│   │   ├── chat-service.ts         Send/receive orchestration, topic + private group routing
│   │   ├── topic-service.ts        Topic join/leave, subscriber sync, group messaging
│   │   ├── private-group-service.ts Private group lifecycle, member sync, Ed25519 signatures
│   │   ├── image-service.ts        Image resize, thumbnail, encrypt, IPFS upload/download
│   │   ├── audio-service.ts        WebM→AAC conversion, inline base64 encoding, IPFS audio
│   │   ├── file-service.ts         Generic file encrypt, IPFS upload/download, cache
│   │   ├── ipfs-service.ts         IPFS HTTP API upload/download, multi-gateway
│   │   ├── contact-service.ts      Contact CRUD
│   │   ├── session-service.ts      Session CRUD
│   │   └── profile-service.ts      Avatar resize, nickname persistence
│   ├── db/              SQLite database layer
│   │   ├── database.ts             Singleton (init/get/close, WAL, FK)
│   │   ├── migrations/             Version-based schema migrations (001–007)
│   │   └── repositories/           One repository per entity (7 repos)
│   ├── ipc/             IPC handler registration (one file per domain)
│   └── crypto/
│       ├── aes-gcm.ts             AES-128-GCM encrypt/decrypt (nMobile-compatible)
│       └── ed25519-signature.ts   Ed25519 sign/verify, group version generation
├── renderer/          React UI (runs in browser context)
│   ├── App.tsx          Auth gate + sidebar nav + page routing
│   ├── pages/           Login, Chat (two-panel), Contacts, Wallet, Settings
│   ├── components/      Flat message rows, image display, lightbox, file display, session list, member panels
│   ├── stores/          Zustand stores (client, chat, contact, session, topic, private-group, profile)
│   └── hooks/           IPC push-event subscriptions
├── shared/            Code shared between main and renderer
│   ├── types/           TypeScript interfaces (Message, Contact, Session, Topic, PrivateGroup, etc.)
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
| Crypto | Node.js crypto (AES-128-GCM, nMobile-compatible) |
| Image Processing | sharp (resize, thumbnail generation) |
| Audio Processing | fluent-ffmpeg + @ffmpeg-installer/ffmpeg (WebM→AAC) |
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

| Threat | Mitigation | Status |
|---|---|---|
| Server compromise | No server. All messages relay through decentralized NKN nodes. | Done |
| Message interception | End-to-end encryption (NKN SDK). Relay nodes cannot decrypt messages. | Done |
| Local data theft | SQLCipher database encryption (AES-256), key derived from wallet seed. | Done |
| Key extraction | Wallet seed encrypted via Electron `safeStorage` (OS keychain). safeStorage required — no plaintext fallback. `wallet.json` permissions set to `0600`. | Done |
| Seed in memory | Ed25519 keypair cached as `Uint8Array`, zeroed on disconnect. Seed not held as instance field. | Done |
| Renderer exploitation | Context isolation enabled, nodeIntegration disabled. Renderer has no Node.js access. | Done |
| Seed exposure to renderer | Seed never crosses IPC boundary. All wallet operations return only address + publicKey. | Done |
| Settings API access control | Allowlist restricts renderer to safe keys only (`ipfs_config`, `profile_*`, `notifications_muted`). | Done |
| Metadata leakage | NKN's onion-like routing obscures sender/recipient from relay nodes. | Done |

### Security Audit (2026-02-21)

See `SECURITY_AUDIT.md` for the full audit report. All critical, high, and medium issues have been remediated.

## Roadmap

| Phase | Focus | Status |
|---|---|---|
| 1 | Foundation — NKN client, 1-to-1 messaging, contacts, SQLite DB | Complete |
| 2 | Rich messaging — Image, voice, and file messaging, IPFS, AES-GCM encryption | Complete |
| 3 | Group chat — Public topics, private groups | Complete |
| 4 | Wallet & polish — NKN/ETH wallets, multi-device sync, notifications | NKN wallet complete |

## Acknowledgments

- [nMobile](https://github.com/nknorg/nMobile) — The original mobile messenger this project is ported from
- [NKN](https://nkn.org/) — The decentralized relay network powering all messaging

## License

MIT
