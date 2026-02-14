# D-Chat Desktop

A desktop messaging application porting [nMobile](https://github.com/nknorg/nMobile) to Electron. D-Chat provides end-to-end encrypted, decentralized messaging over the NKN (New Kind of Network) relay network — no central servers, no metadata leakage.

## Project Overview

nMobile is a Flutter/Dart mobile app. This project reimplements it as an Electron desktop app using TypeScript, React, and the JavaScript NKN SDK. The core value proposition is preserved: private key never leaves the device, messages relay through NKN's decentralized network, and all data is encrypted at rest.

## Current Status

Phase 1 (Foundation) is complete. The app is a functional decentralized messenger: users can create/restore NKN wallets, connect to the network, add contacts, and send/receive end-to-end encrypted text messages with persistent history.

### What exists now
- **NKN client integration** — `nkn-sdk` MultiClient with connect/disconnect/send, connection state management (`src/main/services/nkn-client-service.ts`)
- **1-to-1 messaging** — Send/receive text messages over NKN relay, with sending/sent/failed status tracking (`src/main/services/chat-service.ts`)
- **Contact management** — Add/delete contacts by NKN address, auto-create contacts for unknown senders (`src/main/services/contact-service.ts`)
- **SQLite database** — `better-sqlite3` with WAL mode, foreign keys, version-based migrations (`src/main/db/`)
- **Repository pattern** — MessageRepository, ContactRepository, SessionRepository with typed row mapping
- **IPC handlers** — Full handler set for client, chat, contact, session, wallet, settings (`src/main/ipc/`)
- **Preload bridge** — Typed `window.dchat` API with push-event listeners for real-time updates (`src/preload/index.ts`)
- **Zustand stores** — Client, chat, contact, session stores with IPC subscription hooks (`src/renderer/stores/`)
- **Login page** — Create wallet, import wallet (keystore JSON), restore saved wallet (`src/renderer/pages/Login/`)
- **Chat UI** — Two-panel layout: session list with unread badges + message thread with auto-scroll (`src/renderer/pages/Chat/`)
- **Contacts UI** — Contact list with add form, chat and delete actions (`src/renderer/pages/Contacts/`)
- **Auth gate** — App shows LoginPage when disconnected, main UI when connected (`src/renderer/App.tsx`)
- **Connection status** — Green/yellow/red dot indicator with address display and disconnect button
- **Shared types** — TypeScript interfaces for Message, Contact, Session, WalletInfo, ClientStatus (`src/shared/types/`)
- **Build pipeline** — TypeScript compilation (main + preload) and Vite bundling (renderer), all passing cleanly

### What's not yet built
- Crypto utilities in `src/main/crypto/` (AES-256-GCM wrappers, key derivation)
- SQLCipher encryption (currently plain SQLite — swap `better-sqlite3` for `better-sqlite3-multiple-ciphers`)
- Electron safeStorage for private key persistence
- Wallet page UI and Settings page UI (placeholder screens)
- Message receipts (delivered/read status)
- Media messages, IPFS integration
- Group chat (topics, private groups)
- Desktop notifications

## Tech Stack

| Layer | Technology | Status |
|---|---|---|
| Runtime | Electron 33 | Installed |
| UI Framework | React 18 with TypeScript | Installed |
| State Management | Zustand 4 | Installed |
| Styling | Tailwind CSS 3 | Installed |
| Database | better-sqlite3 (plain SQLite for now) | Installed |
| NKN Networking | nkn-sdk | Installed |
| Crypto | Node.js `crypto` module (AES-256-GCM), tweetnacl-js | Not yet added |
| Secure Storage | Electron safeStorage API | Not yet added |
| File Storage | IPFS (HTTP gateway uploads) | Not yet added |
| Native rebuild | @electron/rebuild | Installed |
| Build/Bundle | Vite 6 (renderer), electron-builder 25 (packaging) | Installed |
| Testing | Vitest 2 (unit), Playwright (e2e) | Installed |
| Linting | ESLint 9, Prettier 3 | Installed |

## Reference App: nMobile Architecture

The original nMobile app (Flutter/Dart) has these key layers — our Electron port mirrors them:

| nMobile Layer | nMobile Tech | D-Chat Desktop Equivalent |
|---|---|---|
| `lib/screens/`, `lib/components/` | Flutter widgets | React components in `src/renderer/` |
| `lib/blocs/` | flutter_bloc (BLoC pattern) | Zustand stores in `src/renderer/stores/` |
| `lib/common/` (22 singleton services) | GetIt service locator | Service classes in `src/main/services/` |
| `lib/schema/` (11 data models) | Dart classes | TypeScript interfaces in `src/shared/types/` |
| `lib/storages/` (11 DAOs, 9 DB tables) | sqflite_sqlcipher | Repository classes in `src/main/db/` |
| `nkn_sdk_flutter` (Go via gomobile) | NKN Go SDK | nkn-sdk-js (native JS) |
| `lib/native/crypto.dart` | Go GCM via MethodChannel | Node.js crypto module |
| `lib/helpers/tweetnacl/` | TweetNaCl Dart | tweetnacl-js |
| `lib/utils/parallel_queue.dart` | Custom concurrency control | p-queue or async-mutex |

## Project Structure

```
dchat/
├── CLAUDE.md                        # AI assistant context (this file)
├── README.md                        # User-facing documentation
├── package.json
├── electron-builder.yml             # Electron packaging config
├── vite.renderer.config.ts          # Vite config for renderer process
├── tsconfig.json                    # Base TypeScript config
├── tsconfig.main.json               # Main process build (CommonJS, rootDir: src)
├── tsconfig.preload.json            # Preload build (CommonJS, rootDir: src)
├── tailwind.config.js
├── postcss.config.js
├── .prettierrc
├── .gitignore
├── src/
│   ├── main/                        # Electron main process
│   │   ├── index.ts                 # ✅ App entry, DB init, services wiring, IPC registration
│   │   ├── ipc/                     # IPC handlers (main ↔ renderer bridge)
│   │   │   ├── register-all.ts      # ✅ Barrel that registers all handler groups
│   │   │   ├── client-handlers.ts   # ✅ client:connect/disconnect/getStatus
│   │   │   ├── chat-handlers.ts     # ✅ chat:sendMessage/getMessages
│   │   │   ├── contact-handlers.ts  # ✅ contact:add/list/get/delete
│   │   │   ├── session-handlers.ts  # ✅ session:list/get/delete
│   │   │   ├── wallet-handlers.ts   # ✅ wallet:create/import (NKN SDK)
│   │   │   └── settings-handlers.ts # ✅ settings:get/set (key-value store)
│   │   ├── services/                # Business logic (mirrors nMobile common/)
│   │   │   ├── nkn-client-service.ts # ✅ NKN MultiClient wrapper, connect/send/events
│   │   │   ├── chat-service.ts      # ✅ Send/receive orchestration, dedup, session mgmt
│   │   │   ├── contact-service.ts   # ✅ Contact CRUD wrapper
│   │   │   └── session-service.ts   # ✅ Session CRUD wrapper
│   │   ├── db/                      # Data access layer
│   │   │   ├── database.ts          # ✅ SQLite singleton (init/get/close, WAL, FK)
│   │   │   ├── migrations/
│   │   │   │   ├── migration-runner.ts    # ✅ Version-based migration executor
│   │   │   │   └── 001-initial-schema.ts  # ✅ contact, session, message, settings tables
│   │   │   └── repositories/
│   │   │       ├── message-repository.ts  # ✅ insert, findBySessionId, updateStatus, dedup
│   │   │       ├── contact-repository.ts  # ✅ upsert, findByAddress, findAll, delete
│   │   │       └── session-repository.ts  # ✅ upsert, findAll, updateLastMessage, unread
│   │   └── crypto/                  # Encryption utilities (not yet implemented)
│   ├── renderer/                    # Electron renderer process (React app)
│   │   ├── index.html               # ✅ HTML shell with CSP
│   │   ├── main.tsx                 # ✅ React entry point
│   │   ├── App.tsx                  # ✅ Auth gate + sidebar nav + page routing
│   │   ├── env.d.ts                 # ✅ Window.dchat type declaration
│   │   ├── stores/
│   │   │   ├── client-store.ts      # ✅ Connection state, connect/disconnect
│   │   │   ├── chat-store.ts        # ✅ Messages by session, send/load/incoming
│   │   │   ├── contact-store.ts     # ✅ Contact list, add/delete
│   │   │   └── session-store.ts     # ✅ Session list, real-time updates
│   │   ├── pages/
│   │   │   ├── Login/LoginPage.tsx  # ✅ Create/import/restore wallet + connect
│   │   │   ├── Chat/ChatPage.tsx    # ✅ Two-panel: session list + message thread
│   │   │   ├── Contacts/ContactsPage.tsx # ✅ Contact list + add form
│   │   │   ├── Wallet/              # Placeholder
│   │   │   └── Settings/            # Placeholder
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── SessionList.tsx  # ✅ Conversation list with previews + unread badges
│   │   │   │   ├── MessageThread.tsx # ✅ Scrollable messages + input, auto-scroll
│   │   │   │   ├── MessageBubble.tsx # ✅ Outbound (blue) / inbound (gray) bubbles
│   │   │   │   └── MessageInput.tsx # ✅ Text input, Enter to send, Shift+Enter newline
│   │   │   └── common/
│   │   │       └── ConnectionStatus.tsx # ✅ Green/yellow/red dot + address
│   │   ├── hooks/
│   │   │   └── use-ipc-subscriptions.ts # ✅ Push-event subscriptions on mount
│   │   └── styles/
│   │       └── global.css           # ✅ Tailwind imports + base styles
│   ├── shared/                      # Shared between main and renderer
│   │   ├── types/
│   │   │   ├── index.ts             # ✅ Barrel re-export
│   │   │   ├── message.ts           # ✅ Message, MessageData, MessageStatus, SendMessageParams
│   │   │   ├── contact.ts           # ✅ Contact, AddContactParams
│   │   │   ├── session.ts           # ✅ Session, SessionType
│   │   │   ├── wallet.ts            # ✅ WalletInfo, CreateWalletParams, ImportWalletParams
│   │   │   └── client.ts            # ✅ ClientStatus
│   │   ├── constants.ts             # ✅ App constants, NKN seed servers
│   │   └── ipc-channels.ts          # ✅ Typed IPC channels + push channels
│   └── preload/
│       └── index.ts                 # ✅ contextBridge API with typed returns + push listeners
├── tests/
│   ├── unit/
│   └── e2e/
└── resources/                       # App icons, assets
```

## Build Output

TypeScript compiles with `rootDir: src`, so the output mirrors the source tree:

```
dist/
├── main/main/index.js               # Electron entry (package.json "main" points here)
├── main/shared/                     # Shared code compiled for main
├── preload/preload/index.js         # Preload script
├── preload/shared/                  # Shared code compiled for preload
└── renderer/                        # Vite-bundled React app
    ├── index.html
    └── assets/
```

## Development Commands

```bash
npm run dev            # Build main+preload, then Vite dev server + Electron concurrently
npm run dev:renderer   # Vite dev server only (no Electron)
npm run build          # Full production build (main + preload + renderer)
npm run build:main     # TypeScript compile main process only
npm run build:preload  # TypeScript compile preload only
npm run build:renderer # Vite build renderer only
npm run package        # Build + package with electron-builder
npm run test           # Run unit tests (Vitest)
npm run test:watch     # Run tests in watch mode
npm run test:e2e       # Run e2e tests (Playwright)
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix
npm run typecheck      # TypeScript type check (no emit)
```

## Architecture: Main vs Renderer Process

```
┌─────────────────────────────────────────────────────┐
│  Renderer Process (React)                           │
│  - UI components, Zustand stores                    │
│  - No Node.js access, no direct DB/network          │
│  - Calls window.dchat.* API                         │
├──────────────── contextBridge ──────────────────────┤
│  Preload Script                                     │
│  - Exposes typed IPC methods as window.dchat        │
│  - ipcRenderer.invoke() → main process              │
├──────────────── IPC (invoke/handle) ────────────────┤
│  Main Process                                       │
│  - NKN client (nkn-sdk-js)                          │
│  - SQLCipher database                               │
│  - Crypto (AES-256-GCM, NaCl)                       │
│  - File I/O, IPFS uploads                           │
│  - Desktop notifications                            │
└─────────────────────────────────────────────────────┘
```

Security: contextIsolation is enabled, nodeIntegration is disabled. The renderer cannot access Node.js APIs directly — all privileged operations go through the typed preload bridge.

## Core Features (Priority Order)

### Phase 1: Foundation
1. **NKN Client Connection** — Create/restore wallet, connect to NKN network, handle connection states (disconnected → connecting → connected)
2. **1-to-1 Messaging** — Send/receive encrypted text messages via NKN relay
3. **Contact Management** — Add contacts by NKN address, profile exchange
4. **Encrypted Local Storage** — SQLCipher database with per-user encryption (key derived from wallet seed)
5. **Message History** — Persist and display conversation threads

### Phase 2: Rich Messaging
6. **Message Status** — Sending → Sent → Delivered → Read receipts
7. **Media Messages** — Image, audio, video, file sharing
8. **IPFS Integration** — Encrypted file upload/download for large media
9. **Burn-after-read** — Self-destructing messages with configurable timers
10. **Erasure Coding** — Split large payloads into redundant pieces for reliable delivery

### Phase 3: Group Chat
11. **Topics (Public Groups)** — On-chain pub/sub via NKN blockchain subscriptions
12. **Private Groups** — Off-chain, signature-based membership with owner/admin/member permissions
13. **Subscriber Management** — Track subscription expiry, permission pages for private topics

### Phase 4: Wallet & Polish
14. **NKN Wallet** — Create, import (keystore/seed), export, send/receive NKN tokens
15. **ETH Wallet** — ERC-20 token support, balance queries
16. **Multi-device Sync** — Queue-based message synchronization across devices
17. **Desktop Notifications** — Native OS notifications for new messages
18. **Name Service** — Human-readable NKN address resolution

## NKN Messaging Protocol

### Connection Lifecycle
```
1. Restore wallet from encrypted keystore (or create new)
2. Create NKN Client via nkn-sdk-js: new nkn.Client({ seed })
3. Client connects to NKN network (WebSocket to relay nodes)
4. Self-ping to verify connection health
5. Listen on client.onMessage() for incoming messages
```

### Message Format
Messages use a JSON envelope (`MessageData`):
```typescript
interface MessageData {
  id: string;           // UUID
  contentType: string;  // text, textExtension, image, audio, video, file, ipfs, piece, ...
  content?: string;
  options?: {
    deleteAfterSeconds?: number;  // burn-after-read
  };
  timestamp: number;
}
```

### Content Types (~25 types from nMobile)
- `text` — Plain text message
- `textExtension` — Burn-after-read text
- `image`, `audio`, `video`, `file` — Media (small, inline)
- `ipfs` — Large file via IPFS (encrypted, with thumbnail)
- `piece` — Erasure-coded fragment of a large payload
- `receipt` — Delivery/read confirmation
- `contact`, `contactOptions` — Profile sync
- `deviceInfo`, `deviceRequest` — Multi-device coordination
- `topicInvitation`, `topicSubscribe`, `topicUnsubscribe` — Group management
- `privateGroupInvitation`, `privateGroupAccept`, `privateGroupQuit` — Private group lifecycle

### Three Chat Paradigms
1. **1-to-1**: Direct NKN messages between two addresses
2. **Topics (Public Groups)**: Messages published to a topic address; subscribers receive via NKN blockchain pub/sub
3. **Private Groups**: Messages sent individually to each member's NKN address; membership managed by cryptographic signatures (not on-chain)

## Database Schema

### Implemented (Phase 1 — migration 001)

| Table | Purpose |
|---|---|
| `contact` | User contacts with profile data (PK: `address`) |
| `session` | Conversation threads with last message preview and unread count (PK: `id`) |
| `message` | All chat messages with content, status, timestamps (FK → `session`) |
| `settings` | App configuration key-value pairs (stores wallet keystore, etc.) |

Indexes: `idx_session_last_message_at`, `idx_message_session_id`, `idx_message_nkn_message_id`

### Planned (future migrations)

| Table | Purpose |
|---|---|
| `message_piece` | Erasure-coded message fragments |
| `wallet` | Encrypted wallet keystores |
| `topic` | Public group metadata and subscription state |
| `private_group` | Private group membership and signatures |
| `private_group_item` | Individual member records within private groups |
| `subscriber` | Topic subscriber tracking |
| `device_info` | Multi-device metadata |

## Key Technical Decisions

### Concurrency Model
nMobile uses `ParallelQueue` extensively for serialized async execution per key (per-contact, per-conversation). Use `p-queue` with concurrency=1 per key, or `async-mutex` for the same pattern in Node.js.

### Security Requirements
- Private keys never leave the device; stored via Electron safeStorage
- Database encrypted with SQLCipher; password derived from SHA-256(wallet seed)
- All NKN messages are end-to-end encrypted by the SDK
- Files uploaded to IPFS are encrypted with AES-256-GCM before upload
- No telemetry or analytics without explicit user consent
- Context isolation enabled, nodeIntegration disabled in renderer

## Coding Conventions

- TypeScript strict mode enabled
- Prefer `async/await` over raw Promises
- Use named exports (no default exports)
- File naming: kebab-case (`chat-out.ts`, `private-group.ts`)
- Component naming: PascalCase (`ChatMessage.tsx`, `ContactList.tsx`)
- IPC channels defined as string constants in `src/shared/ipc-channels.ts`
- All database access goes through repository classes — never raw SQL in services
- Service classes are singletons instantiated at app startup
- Error handling: use typed error classes, never swallow errors silently
- Prefer composition over inheritance
