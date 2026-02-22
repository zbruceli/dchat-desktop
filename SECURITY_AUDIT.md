# Security Audit: Wallet Seed & Secret Key Management

**Date:** 2026-02-21
**Scope:** NKN wallet seed generation, storage, transmission, and usage across the Electron main/renderer process boundary.

## Architecture

```
LoginPage (renderer)
  │ wallet:createAndConnect / wallet:importAndConnect / wallet:restoreAndConnect
  ▼
wallet-handlers.ts (main)          ◄── returns { address, publicKey } only (no seed)
  │
  ├─► wallet.json: keystore + safeStorage-encrypted seed (file in userData)
  │
  │ initServices(seed) → DB key = SHA256(seed)
  ▼
NknClientService (main)
  │ cachedPrivateKey = keyPair(seed)    (Ed25519 keypair cached, seed discarded)
  ▼
nkn.MultiClient({ seed })
```

## Findings

### CRITICAL

#### C1. ~~Seed returned to renderer process in plaintext~~ — FIXED

**Status:** Fixed (2026-02-21)

**What was done:**
- Removed `seed` from `WalletInfo` type
- Wallet handlers now return only `{ address, publicKey }`
- Removed `client:connect(seed)` IPC — connection happens through wallet handlers
- Removed `wallet:saveSeed`, `wallet:loadSeed`, `wallet:clearSeed` IPC channels
- New flow: `wallet:createAndConnect`, `wallet:importAndConnect`, `wallet:restoreAndConnect`, `wallet:autoConnect`
- Seed never crosses the IPC boundary to renderer
- Created `WalletStorageService` to manage `wallet.json` with safeStorage encryption

#### C2. ~~Plaintext fallback when safeStorage unavailable~~ — FIXED

**Status:** Fixed (2026-02-21)

**What was done:**
- Removed all plaintext fallback branches
- `WalletStorageService.save()` and `load()` throw descriptive errors if `safeStorage.isEncryptionAvailable()` returns false
- Error message tells user about platform requirements (macOS Keychain, Windows Credential Manager, Linux Secret Service)

#### C3. ~~Database is unencrypted plain SQLite~~ — FIXED

**Status:** Fixed (2026-02-21)

**What was done:**
- Swapped `better-sqlite3` for `better-sqlite3-multiple-ciphers` (SQLCipher)
- DB encryption key derived from `hex(SHA256(seed))` — matches nMobile convention
- `initDatabase()` accepts optional encryption key, sets `PRAGMA key`
- Existing unencrypted databases migrated via `PRAGMA rekey` on first launch
- Deferred DB initialization — DB only opened after wallet is loaded (seed available)

### HIGH

#### H1. Keystore stored in plaintext SQLite

**Status:** Mitigated by C3 fix — keystore now stored in encrypted SQLCipher database AND in `wallet.json` (encrypted by safeStorage).

#### H2. ~~Unrestricted settings API~~ — FIXED

**Status:** Fixed (2026-02-21)

**What was done:**
- Added `ALLOWED_KEYS` allowlist in `settings-handlers.ts`: `ipfs_config`, `profile_nickname`, `profile_avatar`, `profile_version`
- `settings:get` and `settings:set` throw errors for keys not in the allowlist
- Renderer can no longer read legacy `encrypted_seed`, `keystore`, or `wallet_address` rows

#### H3. ~~Seed held in memory for entire session~~ — FIXED

**Status:** Fixed (2026-02-21)

**What was done:**
- Removed `this.seed` instance field and `getSeed()` method from `NknClientService`
- Ed25519 keypair cached as `Uint8Array` at connect time, seed discarded from instance state
- `cachedPrivateKey.fill(0)` zeros the private key buffer on disconnect and on connection failure
- `getKeyPair()` returns cached keypair instead of re-deriving from seed
- Removed `loadSeedOnly()` from `WalletStorageService` — transfer handler uses scoped `load()?.seed`
- Encryption key validated as `/^[0-9a-f]{64}$/` before PRAGMA key/rekey to prevent injection

### MEDIUM

#### M1. DevTools open in development mode

**File:** `src/main/index.ts` — `mainWindow.webContents.openDevTools()` in dev builds.

**Risk:** All IPC traffic visible. Not a production risk if `isDev` flag works correctly. Seed is no longer in IPC traffic.

#### M2. Sandbox disabled for preload

**File:** `src/main/index.ts` — `sandbox: false`.

**Risk:** Preload has full Node.js access. Necessary for current architecture but increases attack surface.

#### M3. ~~No restrictive file permissions on wallet.json~~ — FIXED

**Status:** Fixed (2026-02-21)

**What was done:**
- `WalletStorageService.save()` sets `chmod 0o600` on `wallet.json` after writing
- DB file (`dchat.db`) permissions rely on SQLCipher encryption as primary protection

## What's Done Right

- `contextIsolation: true` — renderer can't directly access Node.js
- `nodeIntegration: false` — no Node.js in renderer
- No seeds in console.log — checked all 80+ log statements
- No hardcoded test seeds or keys in codebase
- CSP configured — no `unsafe-eval`, limited origins
- safeStorage required — macOS Keychain / Windows DPAPI / Linux Secret Service (no plaintext fallback)
- Seed never leaves main process — not in IPC messages, not in renderer memory
- Database encrypted with SQLCipher — key derived from wallet seed
- Keystore is password-encrypted by nkn-sdk internally
- NKN messages are end-to-end encrypted by the SDK
- IPFS files are AES-128-GCM encrypted before upload
- Wallet data stored in `wallet.json` with safeStorage encryption
- Settings API restricted to allowlisted keys only
- Ed25519 private key cached as `Uint8Array`, zeroed on disconnect
- `wallet.json` file permissions set to `0600` (owner-only)
- PRAGMA key/rekey input validated against strict hex format

## Remediation Plan

| # | Fix | Priority | Effort | Status |
|---|-----|----------|--------|--------|
| 1 | Keep seed in main process only | Critical | Medium | **Done** |
| 2 | Fail instead of plaintext fallback | Critical | Small | **Done** |
| 3 | Enable SQLCipher | Critical | Medium | **Done** |
| 4 | Allowlist settings keys | High | Small | **Done** |
| 5 | Cache keypair, remove seed from memory, zero on disconnect | High | Small | **Done** |
| 6 | Set `0600` file permissions on `wallet.json` | Medium | Small | **Done** |
| 7 | Validate encryption key format before PRAGMA | Medium | Small | **Done** |
