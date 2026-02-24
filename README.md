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

### Messaging
- [x] **1-to-1 encrypted messaging** — Text messages over NKN relay with delivery/read receipts (gray ✓✓ / blue ✓✓)
- [x] **Image messaging** — AES-128-GCM encrypted, IPFS-stored, thumbnail preview, full-screen lightbox
- [x] **Voice messaging** — Record 0.5s–60s, WebM→AAC conversion, inline player with progress bar
- [x] **File sharing** — Any file type up to 100 MB, encrypted via IPFS, open with system default app
- [x] **Burn-after-read** — Per-contact self-destructing messages (5s to 1 week), countdown timer on bubbles, nMobile-compatible
- [x] **Rich text** — Automatic markdown and HTML rendering with styled headings, blockquotes, code blocks, links
- [ ] **Video sharing** — Video media type via IPFS

### Group Chat
- [x] **Public topics** — NKN blockchain-based subscriptions, subscriber panel, text/image/voice/file messaging
- [x] **Private groups** — Off-chain Ed25519 signature-based membership, owner/admin/member permissions, invite/kick/leave, full member sync
- [x] **Public group discovery** — Decentralized P2P discovery via shared NKN topic, browse/search/filter groups, subscriber counts from blockchain, one-click join

### Identity & Contacts
- [x] **NKN wallet** — Create, import (keystore/seed), send/receive NKN tokens, balance display
- [x] **Contact management** — Add by NKN address, auto-create for unknown senders, avatar photos displayed throughout UI
- [x] **Profile** — Nickname + avatar, exchanged with nMobile contacts
- [x] **User profile panel** — View any user's profile from message avatar, subscriber list, or member list

### Security
- [x] **SQLCipher encryption** — AES-256, keyed to wallet seed
- [x] **safeStorage** — Wallet seed encrypted via OS keychain, no plaintext fallback
- [x] **Context isolation** — nodeIntegration disabled, renderer has no Node.js access
- [x] **Seed isolation** — Wallet seed never crosses IPC boundary to renderer

### Desktop Experience
- [x] **Desktop notifications** — Native OS notifications, click to navigate, suppressed when viewing conversation
- [x] **Mute notifications** — Per-conversation toggle + global mute in Settings
- [x] **Connection status** — Green/yellow/red indicator with avatar
- [x] **Discover tab** — Browse public groups with category filters, search, and subscriber counts
- [x] **Settings** — Profile editing, wallet backup, database backup/restore, IPFS gateway config
- [x] **nMobile interop** — Full compatibility with nMobile wire formats

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later

### Install and Run

```bash
git clone <repo-url> dchat && cd dchat
npm install
npx electron-rebuild -f -w better-sqlite3-multiple-ciphers
npx electron-rebuild -f -w sharp
npm run dev
```

On first launch, create a new wallet with a password to connect to the NKN network.

### Build for Production

```bash
npm run build          # Full production build
npm run package        # Package as distributable (dmg/nsis/AppImage)
npm run package:mac    # macOS only
npm run package:win    # Windows only
npm run package:linux  # Linux only
```

## Development

| Command | Description |
|---|---|
| `npm run dev` | Vite hot reload + Electron |
| `npm run build` | Production build (main + preload + renderer) |
| `npm run test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint check |

### Architecture

```
┌─────────────────────────────────────────────────┐
│  Renderer (React + Zustand)                     │
│  UI components, stores — no Node.js access      │
├──────────── contextBridge (IPC) ────────────────┤
│  Main Process                                   │
│  NKN client, SQLCipher DB, crypto, file I/O     │
└─────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| Desktop runtime | Electron 33 |
| UI | React 18, TypeScript, Tailwind CSS 3 |
| State management | Zustand 4 |
| Networking | nkn-sdk (NKN JavaScript SDK) |
| Database | better-sqlite3-multiple-ciphers (SQLCipher) |
| Crypto | Node.js crypto (AES-128-GCM), Ed25519 (libsodium) |
| Media | sharp, fluent-ffmpeg, react-markdown, DOMPurify |
| Build | Vite 6, electron-builder 25, Vitest 2 |

## Security Model

| Threat | Mitigation |
|---|---|
| Server compromise | No server — messages relay through decentralized NKN nodes |
| Message interception | End-to-end encryption (NKN SDK) |
| Local data theft | SQLCipher (AES-256), key derived from wallet seed |
| Key extraction | safeStorage (OS keychain), `wallet.json` permissions `0600` |
| Renderer exploitation | Context isolation, nodeIntegration disabled |
| Seed exposure | Seed never crosses IPC boundary, zeroed on disconnect |
| Settings API abuse | Allowlist restricts renderer to safe keys only |

See `SECURITY_AUDIT.md` for the full audit report.

## Roadmap

| Phase | Focus | Status |
|---|---|---|
| 1 | Foundation — NKN client, 1-to-1 messaging, contacts, encrypted DB | Complete |
| 2 | Rich messaging — Image, voice, file, IPFS, burn-after-read | Complete |
| 3 | Group chat — Public topics, private groups | Complete |
| 4 | Wallet & polish — NKN wallet, notifications, profile sync | Complete |
| 5 | Security hardening — SQLCipher, safeStorage, audit | Complete |
| 6 | Audio-video call, multi-device sync, name service | Planned |

## Acknowledgments

- [nMobile](https://github.com/nknorg/nMobile) — The original mobile messenger this project is ported from
- [NKN](https://nkn.org/) — The decentralized relay network powering all messaging

## License

MIT
