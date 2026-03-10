# D-Chat Desktop

Electron port of [nMobile](https://github.com/nknorg/nMobile) — end-to-end encrypted, decentralized messaging over the NKN relay network. TypeScript, React, nkn-sdk-js. Private key never leaves the device, all data encrypted at rest.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Electron 33 |
| UI | React 18, TypeScript, Tailwind CSS 3, Zustand 4 |
| Database | better-sqlite3-multiple-ciphers (SQLCipher, AES-256) |
| Networking | nkn-sdk (NKN JavaScript SDK) |
| Crypto | Node.js crypto (AES-128-GCM), Ed25519 (libsodium) |
| Media | sharp, fluent-ffmpeg, react-markdown, DOMPurify |
| Storage | IPFS (encrypted upload/download, nMobile nodes) |
| Build | Vite 6, electron-builder 25, Vitest 2 |

## Features

### Messaging (1-to-1)
- Text messages over NKN relay with delivery/read receipts (○→✓→✓✓→blue ✓✓)
- Image messaging — AES-128-GCM encrypted, IPFS-stored, thumbnail preview, lightbox
- Voice messaging — WebM→AAC-ADTS via ffmpeg, inline base64 or IPFS, 0.5s–60s
- File sharing — Any file up to 100 MB, AES-128-GCM encrypted via IPFS
- Burn-after-read — Per-contact self-destructing messages (5s–1 week), countdown timer, `contactOptions` wire format, `textExtension` content type
- Rich text — Auto-detect and render markdown/HTML (react-markdown + DOMPurify)
- **P2P voice calls** — Real-time voice via NKN TUNA (paid relay), Go sidecar (`dchat-tuna`), Opus codec via WebCodecs API (24 kbps, FEC, DTX), call signaling via NKN messages (`voiceCall:invite/accept/decline/end`), mic capture via AudioWorklet, jitter buffer, mute/unmute, call duration timer

### Group Chat
- **Public topics** — NKN blockchain subscriptions, topic hash = `"dchat" + hex(sha1(name))`, messages sent individually to subscribers, Unicode topic names supported
- **Private groups** — Off-chain Ed25519 dual-signature membership, owner/admin/member permissions, invite/kick/leave, member sync protocol
- **Public group discovery** — P2P discovery via shared `publicGroups` NKN topic, 10-min broadcast interval, blockchain subscriber count verification, 7-day stale cleanup, seed groups (d-chat, nkn, general, nMobile, nkn-chat, 中文), Discover tab with search/category filters, group avatars propagated via announcements
- **Create & broadcast public group** — Create public groups from Discover page with name, description, category, avatar; blockchain subscribe + immediate P2P broadcast; announcement messages stored and rendered as group cards in #publicGroups chat thread
- **Group avatars** — Avatars cached in `discovery-cache/`, propagated via announcement broadcasts, displayed in Discover tab, session list, and chat header; startup scan extracts avatars from existing announcement messages

### Identity & Security
- NKN wallet — Create/import/export keystore, send/receive NKN tokens
- SQLCipher database — AES-256, key = `hex(SHA256(seed))`, WAL mode, 10 versioned migrations
- safeStorage — Wallet seed encrypted via OS keychain, no plaintext fallback, `wallet.json` permissions `0600`
- Context isolation — nodeIntegration disabled, seed never crosses IPC to renderer
- Profile — Nickname + avatar (200x200 JPEG via sharp), exchanged with nMobile contacts

### UI
- Two-panel chat layout (session list + message thread), contact avatars everywhere
- Desktop notifications (native OS, click-to-navigate, per-session + global mute)
- Contact edit panel with burn-after-read toggle (accessible from chat header)
- User profile panel — View any user from avatar/subscriber/member clicks
- Discover page — Browse/search/filter public groups by category, join with one click, create new public groups with metadata and avatar
- Login page — Create/import/restore wallet
- Settings — Profile, notification mute, wallet backup, DB backup/restore, NKN bot wallet, IPFS gateway config
- Dark theme with three-tone surface hierarchy, custom Tailwind tokens

### Bot Support
- NKN bot wallet — One-click generation of standalone NKN credentials (public key, wallet address, seed) for use in external bot code
- Seed encrypted at rest via `safeStorage`, hidden by default in UI
- Regenerate and delete with confirmation dialogs

### Not Yet Built
- Video sharing
- ETH wallet / ERC-20
- Multi-device sync
- Erasure coding (piece splitting)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Renderer (React + Zustand)                             │
│  UI components, stores — no Node.js access              │
├──────────── contextBridge (IPC) ────────────────────────┤
│  Main Process (Node.js)                                 │
│  NKN client, SQLCipher DB, crypto, file I/O,            │
│  IPFS, desktop notifications, burn scheduler            │
│  VoiceCallService ↔ JSON-RPC stdio ↔ dchat-tuna binary │
│                                         ↕               │
│                                    TUNA relay nodes      │
│                                    (paid, NKN token)     │
└─────────────────────────────────────────────────────────┘
```

## Project Structure

```
src/
├── main/                          # Electron main process
│   ├── index.ts                   # App entry, deferred DB init, protocol handler
│   ├── utils/
│   │   └── topic-hash.ts          # genTopicHash utility (shared by topic + discovery)
│   ├── services/                  # Business logic (mirrors nMobile common/)
│   │   ├── nkn-client-service.ts  # NKN MultiClient wrapper
│   │   ├── chat-service.ts        # Message orchestration, burn scheduler, receipts, routing
│   │   ├── topic-service.ts       # Topic join/leave, subscriber sync, group messaging
│   │   ├── private-group-service.ts # Private group lifecycle, Ed25519 signatures
│   │   ├── discovery-service.ts   # Public group discovery via P2P broadcast
│   │   ├── image-service.ts       # Resize, thumbnail, AES-GCM encrypt, IPFS
│   │   ├── audio-service.ts       # WebM→AAC conversion, inline/IPFS
│   │   ├── file-service.ts        # File encrypt, IPFS upload/download
│   │   ├── ipfs-service.ts        # IPFS HTTP API, multi-gateway fallback
│   │   ├── contact-service.ts     # Contact CRUD + burn options
│   │   ├── session-service.ts     # Session CRUD
│   │   ├── profile-service.ts     # Avatar + nickname persistence
│   │   ├── contact-profile-service.ts # Profile exchange with nMobile
│   │   ├── voice-call-service.ts     # TUNA sidecar lifecycle, call state machine, signaling
│   │   ├── wallet-storage-service.ts  # wallet.json + safeStorage
│   │   └── bot-wallet-storage-service.ts # bot-wallet.json + safeStorage
│   ├── db/
│   │   ├── database.ts            # SQLCipher singleton (WAL, FK)
│   │   ├── migrations/            # 10 versioned migrations (001–010)
│   │   └── repositories/          # 8 repos: message, contact, session, topic, topic_subscriber, private_group, private_group_member, discovered_group
│   ├── ipc/                       # IPC handlers (one file per domain)
│   └── crypto/
│       ├── aes-gcm.ts             # AES-128-GCM (nMobile-compatible)
│       └── ed25519-signature.ts   # Ed25519 sign/verify, group version
├── renderer/                      # React app (sandboxed)
│   ├── App.tsx                    # Auth gate + sidebar nav + routing
│   ├── stores/                    # Zustand: client, chat, contact, session, topic, private-group, profile, nav, user-profile-panel, discovery, voice-call
│   ├── pages/                     # Login, Chat, Contacts, Discover, Wallet, Settings
│   ├── components/
│   │   ├── chat/                  # SessionList, MessageThread, MessageBubble, MessageInput, AudioContent, FileContent, VoiceRecordButton, ImageModal, PrivateGroupMemberPanel
│   │   ├── voice/                 # CallButton, ActiveCallBar, IncomingCallModal
│   │   ├── common/                # ConnectionStatus, CopyableField, UserProfilePanel
│   │   └── contact/               # ContactEditPanel (with burn-after-read toggle)
│   ├── hooks/                     # use-ipc-subscriptions, use-voice-audio
│   ├── workers/                   # audio-processor.worklet.ts (AudioWorklet for PCM capture)
│   └── styles/global.css          # Tailwind + rich-text styles
├── shared/                        # Shared between main and renderer
│   ├── types/                     # Message, Contact, Session, Topic, PrivateGroup, Profile, Wallet, Client, Discovery, Bot, Voice
│   ├── constants.ts               # App constants, burn durations, NKN seed servers
│   └── ipc-channels.ts            # Typed IPC channel definitions
├── preload/index.ts               # contextBridge → typed window.dchat API
└── tests/                         # 340 unit tests (Vitest)

dchat-tuna/                        # Go sidecar for TUNA voice calls
├── main.go                        # JSON-RPC over stdin/stdout, TUNA session mgmt
└── go.mod                         # Go module (nkn-sdk-go, nkn-tuna-session)
```

## Commands

```bash
npm run dev          # Vite hot reload + Electron (preferred for testing)
npm run build        # Production build (main + preload + renderer)
npm run test         # Unit tests (Vitest)
npm run typecheck    # TypeScript type check
npm run package      # Build + package with electron-builder
npm run package:mac  # macOS (DMG + ZIP)
npm run package:win  # Windows (NSIS + portable)
npm run package:linux # Linux (AppImage + DEB)
```

### Build & Launch Notes
- **Dev mode** (`npm run dev`): Builds main + preload via tsc, then runs Vite dev server (port 5173) + Electron concurrently. This is the correct way to test the app locally.
- **Production build** (`npm run build`): Outputs to `dist/main/main/`, `dist/preload/preload/`, `dist/renderer/`. The `package.json` `"main"` field is `dist/main/main/index.js`.
- **Do NOT** run `npx electron dist/main/index.js` — the correct entry is `npx electron .` (reads `"main"` from `package.json`), but this only works after `npm run build` and the renderer will be blank unless Vite dev server is also running or the built renderer HTML path is correct.
- **Always prefer `npm run dev`** for testing changes — it handles everything automatically.

## Database Schema (10 migrations)

| Table | Key Columns |
|---|---|
| `contact` | address (PK), name, avatar_uri, profile_version, burn_after_seconds, burn_update_at |
| `session` | id (PK), type, target_address, target_name, last_message_content, unread_count, muted |
| `message` | id (PK), session_id (FK), sender, receiver, content_type, content, status, is_outbound, options, local_file_path, thumbnail_local_file_path, delete_at, is_delete |
| `settings` | key (PK), value |
| `topic` | id (PK), name, joined, subscribe_at, expire_height, member_count |
| `topic_subscriber` | topic_id + contact_address (PK) |
| `private_group` | group_id (PK), name, type, joined, version, signature, count, data |
| `private_group_member` | group_id + invitee (PK), inviter, permission, invitee_signature, inviter_signature, expires_at |
| `discovered_group` | topic_name (PK), description, category, subscriber_count, reported_by, last_reported_at, last_verified_at |

## NKN Wire Format (nMobile-compatible)

### Message Envelope
```typescript
interface MessageData {
  id: string;           // UUID
  contentType: string;  // text, textExtension, ipfs, audio, receipt, read, contactOptions, topic:*, privateGroup:*
  content?: string;     // Text content or IPFS CID
  options?: MessageOptions;  // IPFS metadata, encryption keys, file info, burn settings
  topic?: string;       // Topic name (public groups)
  groupId?: string;     // Group ID (private groups)
  timestamp: number;
}
```

### Content Types
| Type | Usage |
|---|---|
| `text` | Plain text |
| `textExtension` | Burn-after-read text |
| `ipfs` | IPFS file (fileType: 0=file, 1=image, 2=audio, 3=video) |
| `audio` | Inline voice (base64 AAC-ADTS in `![audio](data:audio/x-aac;base64,...)`) |
| `receipt` / `read` | Delivery/read confirmations |
| `contact` / `contactOptions` | Profile sync / burn setting exchange |
| `topic:subscribe` / `topic:unsubscribe` | Topic join/leave |
| `privateGroup:invitation` / `accept` / `subscribe` / `quit` | Private group lifecycle |
| `privateGroup:optionRequest` / `optionResponse` / `memberRequest` / `memberResponse` | Group sync |
| `discovery:broadcast` | P2P public group discovery broadcast |
| `voiceCall:invite` / `accept` / `decline` / `end` | Voice call signaling |

### IPFS Encryption
- AES-128-GCM: 16-byte key, 12-byte nonce prepended to ciphertext
- Keys sent as byte arrays in `ipfsEncryptKeyBytes`
- Thumbnail and full image have separate keys and IPFS hashes
- Default gateway: `64.225.88.71:80` (nMobile IPFS nodes)

### Chat Paradigms
1. **1-to-1**: Direct NKN messages between two addresses
2. **Topics**: Sender fetches subscribers from blockchain, sends individually. Hash: `"dchat" + hex(sha1(name))`. Subscription: ~93 day blockchain txn.
3. **Private Groups**: Messages sent individually to members. Ed25519 dual-signatures. Group ID: `{ownerPubKey}.{uuid}`. Permissions: owner(30) > admin(20) > normal(10).

## Coding Conventions

- TypeScript strict mode, `async/await`, named exports
- File naming: kebab-case; Components: PascalCase
- Database access only through repository classes
- Service classes are singletons
- IPC channels as string constants in `ipc-channels.ts`
- Custom protocol `dchat-media://` serves cached media (hostname = cache directory name)
