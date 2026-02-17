# D-Chat Desktop

A desktop messaging application porting [nMobile](https://github.com/nknorg/nMobile) to Electron. D-Chat provides end-to-end encrypted, decentralized messaging over the NKN (New Kind of Network) relay network — no central servers, no metadata leakage.

## Project Overview

nMobile is a Flutter/Dart mobile app. This project reimplements it as an Electron desktop app using TypeScript, React, and the JavaScript NKN SDK. The core value proposition is preserved: private key never leaves the device, messages relay through NKN's decentralized network, and all data is encrypted at rest.

## Current Status

Phase 1 (Foundation), Phase 2 (rich messaging), and Phase 3 public group chat are complete. The app is a functional decentralized messenger with full image, voice, file, and group chat support: users can create/restore NKN wallets, connect to the network, add contacts, send/receive end-to-end encrypted text, image, voice, and file messages with persistent history, join/leave public topic groups with subscriber management, and interoperate with nMobile.

### What exists now
- **NKN client integration** — `nkn-sdk` MultiClient with connect/disconnect/send/sendNoReply/subscribe/unsubscribe/getSubscribers, connection state management (`src/main/services/nkn-client-service.ts`)
- **1-to-1 messaging** — Send/receive text messages over NKN relay, with sending/sent/failed status tracking (`src/main/services/chat-service.ts`)
- **Image messaging** — Send/receive encrypted images via IPFS, nMobile-compatible wire format (`src/main/services/chat-service.ts`)
- **Voice messaging** — Record WebM/Opus via MediaRecorder, convert to AAC-ADTS via ffmpeg, send inline as base64 data-URI, nMobile-compatible (`src/main/services/audio-service.ts`)
- **File sharing** — Send/receive any file type (up to 100 MB) encrypted via IPFS, nMobile-compatible wire format with `fileType: 0`, open with system default app (`src/main/services/file-service.ts`)
- **Group chat (public topics)** — Join/leave NKN blockchain-based topic groups, nMobile-compatible: topic name hashed via SHA-1 (`"dchat" + hex(sha1(name))`), subscribe/unsubscribe blockchain transactions, subscriber list cached locally, messages sent individually to all subscribers (`src/main/services/topic-service.ts`)
- **IPFS integration** — Upload/download encrypted files to nMobile's IPFS nodes (default `64.225.88.71:80`), multi-gateway fallback (`src/main/services/ipfs-service.ts`)
- **Image processing** — Resize, thumbnail generation (120x120), AES-128-GCM encryption, local caching (`src/main/services/image-service.ts`)
- **Audio processing** — WebM→AAC-ADTS conversion via ffmpeg (mono, 48kbps, 22050Hz), local caching in `audio-cache/` (`src/main/services/audio-service.ts`)
- **File processing** — AES-128-GCM encryption, IPFS upload/download, local caching in `file-cache/` (`src/main/services/file-service.ts`)
- **AES-GCM crypto** — Encrypt/decrypt with 16-byte keys, 12-byte nonce prepended to ciphertext, nMobile-compatible format (`src/main/crypto/aes-gcm.ts`)
- **Custom protocol** — `dchat-media://` file protocol for serving cached images, audio, and files to renderer securely (with explicit MIME types)
- **Contact management** — Add/delete contacts by NKN address, auto-create contacts for unknown senders (`src/main/services/contact-service.ts`)
- **SQLite database** — `better-sqlite3` with WAL mode, foreign keys, version-based migrations (`src/main/db/`)
- **Repository pattern** — MessageRepository, ContactRepository, SessionRepository, TopicRepository, TopicSubscriberRepository with typed row mapping
- **IPC handlers** — Full handler set for client, chat, contact, session, wallet, settings, topic (`src/main/ipc/`)
- **Preload bridge** — Typed `window.dchat` API with push-event listeners for real-time updates (`src/preload/index.ts`)
- **Zustand stores** — Client, chat, contact, session, topic stores with IPC subscription hooks (`src/renderer/stores/`)
- **Login page** — Create wallet, import wallet (keystore JSON), restore saved wallet (`src/renderer/pages/Login/`)
- **Chat UI** — Two-panel layout: session list with unread badges + message thread with auto-scroll, image display with thumbnail preview (`src/renderer/pages/Chat/`)
- **Image UI** — Thumbnail preview while downloading, full-size display, lightbox modal, retry on failure, upload progress (`src/renderer/components/chat/MessageBubble.tsx`)
- **Voice message UI** — Record button (click-to-start/stop, 0.5s–60s), audio player with play/pause, progress bar, duration display (`src/renderer/components/chat/VoiceRecordButton.tsx`, `AudioContent.tsx`)
- **File message UI** — File attachment button (paperclip icon), file display with doc icon, filename, size, upload/download progress, click-to-open with system default app, retry on failure (`src/renderer/components/chat/FileContent.tsx`)
- **Topic UI** — Join/create topic dialog (`#` button), topic sessions with `#` icon in session list, sender names on inbound messages, member count display, subscriber side panel with refresh from blockchain, Leave button (`src/renderer/components/chat/MessageThread.tsx`)
- **Contacts UI** — Contact list with add form, chat and delete actions (`src/renderer/pages/Contacts/`)
- **Settings UI** — IPFS gateway configuration (host/port) (`src/renderer/pages/Settings/SettingsPage.tsx`)
- **Auth gate** — App shows LoginPage when disconnected, main UI when connected (`src/renderer/App.tsx`)
- **Connection status** — Green/yellow/red dot indicator with address display and disconnect button
- **Shared types** — TypeScript interfaces for Message, MessageOptions, Contact, Session, WalletInfo, ClientStatus (`src/shared/types/`)
- **Build pipeline** — TypeScript compilation (main + preload) and Vite bundling (renderer), all passing cleanly
- **Test suite** — 63 unit tests covering crypto, DB migrations, repositories, IPFS service, image service, and chat service

### What's not yet built
- SQLCipher encryption (currently plain SQLite — swap `better-sqlite3` for `better-sqlite3-multiple-ciphers`)
- Electron safeStorage for private key persistence
- Wallet page UI (placeholder screen)
- Message receipts (delivered/read status)
- Video sharing
- Private groups (off-chain, signature-based membership)
- Media messages in topics (image/audio/file — currently text-only in group chat)
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
| Crypto | Node.js `crypto` module (AES-128-GCM) | Implemented |
| Image Processing | sharp (resize, thumbnail generation) | Installed |
| Audio Processing | fluent-ffmpeg + @ffmpeg-installer/ffmpeg (WebM→AAC) | Installed |
| Secure Storage | Electron safeStorage API | Not yet added |
| File Storage | IPFS (HTTP gateway, nMobile nodes) | Implemented |
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
│   │   │   ├── chat-handlers.ts     # ✅ chat:sendMessage/getMessages/sendAudio/downloadAudio/sendFile/downloadFile/openFile
│   │   │   ├── contact-handlers.ts  # ✅ contact:add/list/get/delete
│   │   │   ├── session-handlers.ts  # ✅ session:list/get/delete
│   │   │   ├── wallet-handlers.ts   # ✅ wallet:create/import (NKN SDK)
│   │   │   ├── settings-handlers.ts # ✅ settings:get/set (key-value store)
│   │   │   └── topic-handlers.ts   # ✅ topic:create/join/leave/list/get/getSubscribers/refreshSubscribers/sendMessage
│   │   ├── services/                # Business logic (mirrors nMobile common/)
│   │   │   ├── nkn-client-service.ts # ✅ NKN MultiClient wrapper, connect/send/sendNoReply/subscribe/unsubscribe/getSubscribers/sendToMultiple
│   │   │   ├── chat-service.ts      # ✅ Send/receive orchestration, dedup, session mgmt, image + audio + file messaging, topic message routing
│   │   │   ├── topic-service.ts     # ✅ Topic join/leave, subscriber sync, topic message send/receive, control messages
│   │   │   ├── audio-service.ts     # ✅ WebM→AAC conversion, inline base64 encoding, IPFS audio download/decrypt
│   │   │   ├── image-service.ts     # ✅ Image resize, thumbnail, AES-GCM encrypt, IPFS upload/download
│   │   │   ├── file-service.ts      # ✅ Generic file encrypt, IPFS upload/download, cache in file-cache/
│   │   │   ├── ipfs-service.ts      # ✅ IPFS HTTP API upload/download, multi-gateway fallback
│   │   │   ├── contact-service.ts   # ✅ Contact CRUD wrapper
│   │   │   └── session-service.ts   # ✅ Session CRUD wrapper
│   │   ├── db/                      # Data access layer
│   │   │   ├── database.ts          # ✅ SQLite singleton (init/get/close, WAL, FK)
│   │   │   ├── migrations/
│   │   │   │   ├── migration-runner.ts    # ✅ Version-based migration executor (4 migrations)
│   │   │   │   ├── 001-initial-schema.ts  # ✅ contact, session, message, settings tables
│   │   │   │   ├── 002-add-message-options.ts # ✅ options + local_file_path columns on message
│   │   │   │   ├── 003-add-thumbnail-path.ts  # ✅ thumbnail_local_file_path column on message
│   │   │   │   └── 004-add-topic-tables.ts   # ✅ topic + topic_subscriber tables
│   │   │   └── repositories/
│   │   │       ├── message-repository.ts  # ✅ insert, findBySessionId, updateStatus, updateOptions, updateLocalFilePath, updateThumbnailLocalFilePath, updateContentType
│   │   │       ├── contact-repository.ts  # ✅ upsert, findByAddress, findAll, delete
│   │   │       ├── session-repository.ts  # ✅ upsert, findAll, updateLastMessage, unread
│   │   │       ├── topic-repository.ts    # ✅ upsert, findById, findAll, findJoined, setJoined, setMemberCount
│   │   │       └── topic-subscriber-repository.ts # ✅ upsert, findByTopicId, replaceAll, delete
│   │   └── crypto/
│   │       └── aes-gcm.ts          # ✅ AES-128-GCM encrypt/decrypt (nMobile-compatible)
│   ├── renderer/                    # Electron renderer process (React app)
│   │   ├── index.html               # ✅ HTML shell with CSP (incl. media-src for audio playback)
│   │   ├── main.tsx                 # ✅ React entry point
│   │   ├── App.tsx                  # ✅ Auth gate + sidebar nav + page routing
│   │   ├── env.d.ts                 # ✅ Window.dchat type declaration
│   │   ├── stores/
│   │   │   ├── client-store.ts      # ✅ Connection state, connect/disconnect
│   │   │   ├── chat-store.ts        # ✅ Messages by session, send/load/incoming, sendAudio/downloadAudio/sendFile/downloadFile/openFile
│   │   │   ├── contact-store.ts     # ✅ Contact list, add/delete
│   │   │   ├── session-store.ts     # ✅ Session list, real-time updates, delete events
│   │   │   └── topic-store.ts       # ✅ Topic list, create/join/leave, subscriber fetch, real-time updates
│   │   ├── pages/
│   │   │   ├── Login/LoginPage.tsx  # ✅ Create/import/restore wallet + connect
│   │   │   ├── Chat/ChatPage.tsx    # ✅ Two-panel: session list + message thread
│   │   │   ├── Contacts/ContactsPage.tsx # ✅ Contact list + add form
│   │   │   ├── Wallet/              # Placeholder
│   │   │   └── Settings/SettingsPage.tsx # ✅ IPFS gateway configuration
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── SessionList.tsx  # ✅ Conversation list with previews + unread badges
│   │   │   │   ├── MessageThread.tsx # ✅ Scrollable messages + input, auto-scroll
│   │   │   │   ├── MessageBubble.tsx # ✅ Text + image + audio + file bubbles, thumbnail preview, retry, lightbox
│   │   │   │   ├── MessageInput.tsx # ✅ Text input + image attachment + file attachment + voice record button
│   │   │   │   ├── FileContent.tsx  # ✅ File display (doc icon, name, size, download/open/retry)
│   │   │   │   ├── AudioContent.tsx # ✅ Audio player (play/pause, progress bar, duration)
│   │   │   │   ├── VoiceRecordButton.tsx # ✅ Click-to-record mic button (0.5s–60s, cancel, send)
│   │   │   │   └── ImageModal.tsx   # ✅ Full-screen image lightbox overlay
│   │   │   └── common/
│   │   │       └── ConnectionStatus.tsx # ✅ Green/yellow/red dot + address
│   │   ├── hooks/
│   │   │   └── use-ipc-subscriptions.ts # ✅ Push-event subscriptions on mount
│   │   └── styles/
│   │       └── global.css           # ✅ Tailwind imports + base styles
│   ├── shared/                      # Shared between main and renderer
│   │   ├── types/
│   │   │   ├── index.ts             # ✅ Barrel re-export
│   │   │   ├── message.ts           # ✅ Message, MessageData (with topic field), MessageOptions, MessageStatus, SendMessageParams
│   │   │   ├── contact.ts           # ✅ Contact, AddContactParams
│   │   │   ├── session.ts           # ✅ Session, SessionType
│   │   │   ├── wallet.ts            # ✅ WalletInfo, CreateWalletParams, ImportWalletParams
│   │   │   ├── client.ts            # ✅ ClientStatus
│   │   │   └── topic.ts             # ✅ Topic, TopicSubscriber
│   │   ├── constants.ts             # ✅ App constants, NKN seed servers
│   │   └── ipc-channels.ts          # ✅ Typed IPC channels + push channels (incl. TOPIC section, session/topic delete events)
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
  contentType: string;  // text, textExtension, image, audio, video, file, ipfs, piece, topic:subscribe, ...
  content?: string;     // For ipfs: IPFS CID hash
  options?: MessageOptions;  // IPFS metadata, encryption keys, file info
  topic?: string;       // Topic name for group messages
  timestamp: number;
}
```

### IPFS Image Wire Format (nMobile-compatible)
```json
{
  "id": "uuid",
  "contentType": "ipfs",
  "content": "QmXoy...",
  "options": {
    "ipfsHash": "QmXoy...",
    "ipfsIp": "64.225.88.71",
    "ipfsEncrypt": 1,
    "ipfsEncryptAlgorithm": "AES/GCM/NoPadding",
    "ipfsEncryptKeyBytes": [170, 187, 204, ...],
    "ipfsEncryptNonceSize": 12,
    "ipfsThumbnailHash": "QmThumb...",
    "ipfsThumbnailIp": "64.225.88.71",
    "ipfsThumbnailEncrypt": 1,
    "ipfsThumbnailEncryptAlgorithm": "AES/GCM/NoPadding",
    "ipfsThumbnailEncryptKeyBytes": [1, 2, 3, ...],
    "ipfsThumbnailEncryptNonceSize": 12,
    "fileType": 1,
    "fileExt": "jpg",
    "fileMimeType": "image",
    "fileSize": 245760,
    "mediaWidth": 1024,
    "mediaHeight": 768
  },
  "timestamp": 1707900000000
}
```

Key conventions:
- `contentType: "ipfs"` (not `"image"`) for IPFS-stored images
- Encryption keys sent as byte arrays (not hex strings)
- 12-byte nonce is prepended to ciphertext (not sent separately)
- Thumbnail and full image have separate encryption keys and IPFS hashes
- `ipfsIp` tells receiver which gateway to prioritize for downloads

### Inline Audio Wire Format (nMobile-compatible)
```json
{
  "id": "uuid",
  "contentType": "audio",
  "content": "![audio](data:audio/x-aac;base64,//FgQBD...)",
  "options": {
    "fileType": 2,
    "fileExt": "aac",
    "fileMimeType": "audio/aac",
    "mediaDuration": 5.23
  },
  "timestamp": 1707900000000
}
```

Key conventions:
- `contentType: "audio"` for inline voice messages (base64 AAC-ADTS)
- Content is wrapped in nMobile's markdown data-URI format: `![audio](data:audio/x-aac;base64,...)`
- nMobile also sends `audioDuration` (same value as `mediaDuration`) — D-Chat reads `mediaDuration`
- `fileType: 2` distinguishes audio from images (`fileType: 1`) in IPFS messages
- AAC-ADTS is the universal codec — nMobile uses it on both iOS and Android
- D-Chat converts browser WebM/Opus → AAC-ADTS via ffmpeg before sending
- Recording constraints: min 0.5s, max 60s
- Inbound IPFS audio (`contentType: "ipfs"`, `fileType: 2`) is also supported for receiving

### IPFS File Wire Format (nMobile-compatible)
```json
{
  "id": "uuid",
  "contentType": "ipfs",
  "content": "QmXyz...",
  "options": {
    "fileType": 0,
    "fileName": "report.pdf",
    "fileSize": 524288,
    "fileExt": "pdf",
    "ipfsHash": "QmXyz...",
    "ipfsIp": "64.225.88.71",
    "ipfsEncrypt": 1,
    "ipfsEncryptAlgorithm": "AES/GCM/NoPadding",
    "ipfsEncryptKeyBytes": [170, 187, 204, ...],
    "ipfsEncryptNonceSize": 12
  },
  "timestamp": 1707900000000
}
```

Key conventions:
- `contentType: "ipfs"` with `fileType: 0` for generic files (0=normal, 1=image, 2=audio, 3=video)
- `fileName` contains the original filename (e.g., `"report.pdf"`)
- No thumbnail for generic files (only images/videos get thumbnails)
- Same AES-128-GCM encryption as images (16-byte key, 12-byte nonce prepended to ciphertext)
- Size limit: 100 MB
- All generic files go through IPFS regardless of size (no inline option)

### Topic Message Wire Format (nMobile-compatible)

Regular topic messages include a `topic` field in the standard MessageData envelope:
```json
{
  "id": "uuid",
  "contentType": "text",
  "content": "Hello group!",
  "topic": "general",
  "timestamp": 1707900000000
}
```

Topic control messages for join/leave notifications:
```json
{ "id": "uuid", "contentType": "topic:subscribe", "topic": "general", "timestamp": ... }
{ "id": "uuid", "contentType": "topic:unsubscribe", "topic": "general", "timestamp": ... }
```

Key conventions:
- Topic names are hashed before NKN API calls: `"dchat" + hex(sha1(topicName))` (nMobile convention in `genTopicHash()`)
- Messages are NOT published to a topic address — sender fetches subscriber list and sends individually via `client.send(destList, data)`
- Subscriber list fetched from blockchain via `client.getSubscribers()` and cached in `topic_subscriber` table
- Session ID format: `topic:{topicName}`, session type: `"topic"`
- Zero-fee blockchain subscriptions (duration = 400,000 blocks, ~93 days)

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
2. **Topics (Public Groups)**: Sender fetches subscriber list from blockchain and sends to each subscriber individually (NOT via topic publish). Topic name is hashed (`"dchat" + sha1(name)`) for NKN API calls. Subscription is a blockchain transaction (~93 day duration). **Implemented.**
3. **Private Groups**: Messages sent individually to each member's NKN address; membership managed by cryptographic signatures (not on-chain). **Not yet implemented.**

## Database Schema

### Implemented (migrations 001–004)

| Table | Purpose |
|---|---|
| `contact` | User contacts with profile data (PK: `address`) |
| `session` | Conversation threads with last message preview and unread count (PK: `id`) |
| `message` | All chat messages with content, status, options (JSON), local_file_path, thumbnail_local_file_path (FK → `session`) |
| `settings` | App configuration key-value pairs (stores wallet keystore, IPFS config, etc.) |
| `topic` | Public group metadata: joined status, subscribe time, expiry block height, member count (PK: `id`) |
| `topic_subscriber` | Cached subscriber list per topic (PK: `topic_id, contact_address`) |

Indexes: `idx_session_last_message_at`, `idx_message_session_id`, `idx_message_nkn_message_id`, `idx_topic_subscriber_topic_id`

Migration history:
- **001**: Initial schema — contact, session, message, settings tables
- **002**: Add `options` (TEXT) and `local_file_path` (TEXT) columns to message
- **003**: Add `thumbnail_local_file_path` (TEXT) column to message
- **004**: Add `topic` and `topic_subscriber` tables for group chat

### Planned (future migrations)

| Table | Purpose |
|---|---|
| `message_piece` | Erasure-coded message fragments |
| `wallet` | Encrypted wallet keystores |
| `private_group` | Private group membership and signatures |
| `private_group_item` | Individual member records within private groups |
| `device_info` | Multi-device metadata |

## Key Technical Decisions

### Concurrency Model
nMobile uses `ParallelQueue` extensively for serialized async execution per key (per-contact, per-conversation). Use `p-queue` with concurrency=1 per key, or `async-mutex` for the same pattern in Node.js.

### Security Requirements
- Private keys never leave the device; stored via Electron safeStorage
- Database encrypted with SQLCipher; password derived from SHA-256(wallet seed)
- All NKN messages are end-to-end encrypted by the SDK
- Files uploaded to IPFS are encrypted with AES-128-GCM (16-byte key, 12-byte nonce) before upload
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
