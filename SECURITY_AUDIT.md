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
  │ this.seed = seed                    (held in memory for session lifetime)
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

#### H2. Unrestricted settings API

**Files:**
- `src/main/ipc/settings-handlers.ts:7-18` — `settings:get(key)` accepts any key, no validation
- `src/preload/index.ts` — renderer can call `window.dchat.settings.get()` with any key

**Risk:** Compromised renderer or XSS can read sensitive data through the generic API.

**Fix:** Add allowlist of safe keys (`ipfs_config`, `profile_*`). Use dedicated handlers for sensitive data. Seed and keystore are no longer stored in settings table (moved to `wallet.json`), but encrypted_seed/wallet_address rows may still exist in legacy databases.

#### H3. Seed held in memory for entire session

**Files:**
- `src/main/services/nkn-client-service.ts:9` — `this.seed = seed` as instance field
- `src/main/services/nkn-client-service.ts:84-86` — public `getSeed()` method returns it

**Risk:** Memory dump exposes seed. No secure zeroing.

**Fix:** Clear `this.seed` after MultiClient is created. Derive keypair from client object instead. Remove `getSeed()`.

### MEDIUM

#### M1. DevTools open in development mode

**File:** `src/main/index.ts` — `mainWindow.webContents.openDevTools()` in dev builds.

**Risk:** All IPC traffic visible. Not a production risk if `isDev` flag works correctly. Seed is no longer in IPC traffic.

#### M2. Sandbox disabled for preload

**File:** `src/main/index.ts` — `sandbox: false`.

**Risk:** Preload has full Node.js access. Necessary for current architecture but increases attack surface.

#### M3. No restrictive file permissions on database

**Risk:** DB file inherits OS default umask. On Linux, may be world-readable. Mitigated by SQLCipher encryption.

**Fix:** Set `0600` on `dchat.db` and `wallet.json` after creation.

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

## Remediation Plan

| # | Fix | Priority | Effort | Status |
|---|-----|----------|--------|--------|
| 1 | Keep seed in main process only | Critical | Medium | **Done** |
| 2 | Fail instead of plaintext fallback | Critical | Small | **Done** |
| 3 | Enable SQLCipher | Critical | Medium | **Done** |
| 4 | Allowlist settings keys | High | Small | Open |
| 5 | Zero seed in NknClientService after client init | High | Small | Open |
| 6 | Set `0600` file permissions on database and wallet.json | Medium | Small | Open |
