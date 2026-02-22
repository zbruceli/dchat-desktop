# Security Audit: Wallet Seed & Secret Key Management

**Date:** 2026-02-21
**Scope:** NKN wallet seed generation, storage, transmission, and usage across the Electron main/renderer process boundary.

## Architecture

```
LoginPage (renderer)
  │ wallet:create / wallet:import
  ▼
wallet-handlers.ts (main)          ◄── returns WalletInfo { seed, address, publicKey, keystore }
  │
  ├─► settings table: "keystore"        (password-encrypted JSON, stored plaintext in DB)
  ├─► settings table: "encrypted_seed"  (safeStorage-encrypted, plaintext fallback)
  └─► settings table: "wallet_address"  (plaintext)
  │
  │ client:connect(seed)
  ▼
NknClientService (main)
  │ this.seed = seed                    (held in memory for session lifetime)
  ▼
nkn.MultiClient({ seed })
```

## Findings

### CRITICAL

#### C1. Seed returned to renderer process in plaintext

**Files:**
- `src/main/ipc/wallet-handlers.ts:13` — `seed: wallet.getSeed()` in create handler
- `src/main/ipc/wallet-handlers.ts:28` — `seed: wallet.getSeed()` in import handler
- `src/shared/types/wallet.ts:4` — `WalletInfo` interface includes `seed: string`
- `src/renderer/pages/Login/LoginPage.tsx:22-26` — seed held in React variable after create
- `src/renderer/pages/Login/LoginPage.tsx:42-46` — seed held in React variable after import
- `src/renderer/stores/client-store.ts:48-56` — `loadSeed()` returns seed to renderer on auto-connect
- `src/preload/index.ts:21-22` — `client.connect(seed)` sends seed over IPC

**Risk:** Seed visible in DevTools IPC inspector, held in renderer memory, accessible via XSS.

**Fix:** Remove `seed` from `WalletInfo`. Have `wallet:create`/`import` store seed internally in main process. Change `client:connect` to accept keystore + password instead of raw seed.

#### C2. Plaintext fallback when safeStorage unavailable

**Files:**
- `src/main/ipc/wallet-handlers.ts:66-70` — if `safeStorage.isEncryptionAvailable()` is false, seed stored as plaintext JSON in SQLite
- `src/main/ipc/wallet-handlers.ts:94-96` — on decryption failure, silently falls back to treating stored value as plaintext
- `src/main/ipc/wallet-handlers.ts:128-131` — same pattern in transfer handler

**Risk:** On Linux without Secret Service (or headless/CI environments), seed is completely unprotected. No user warning.

**Fix:** Throw error if safeStorage unavailable. Show user warning about platform requirements.

#### C3. Database is unencrypted plain SQLite

**Files:**
- `src/main/db/database.ts:1,11` — uses `better-sqlite3`, not SQLCipher
- `src/main/db/migrations/001-initial-schema.ts:45-48` — settings table is plain TEXT

**Risk:** Database at `{userData}/dchat.db` is a regular file. Anyone with filesystem access reads all data: keystore, seed (if fallback), wallet address, all messages, all contacts.

**Fix:** Switch to `better-sqlite3-multiple-ciphers`, derive DB key from SHA-256(wallet seed).

### HIGH

#### H1. Keystore stored in plaintext SQLite

**Files:**
- `src/renderer/pages/Login/LoginPage.tsx:23,43` — `settings.set("keystore", wallet.keystore)`
- `src/main/ipc/settings-handlers.ts:20-25` — generic handler stores as plain TEXT

**Risk:** Attacker with DB access gets keystore and only needs to brute-force the user's password.

**Fix:** Encrypt keystore with safeStorage before storing, or rely on SQLCipher for at-rest protection.

#### H2. Unrestricted settings API

**Files:**
- `src/main/ipc/settings-handlers.ts:7-18` — `settings:get(key)` accepts any key, no validation
- `src/preload/index.ts:134-139` — renderer can call `window.dchat.settings.get("encrypted_seed")`

**Risk:** Compromised renderer or XSS can read encrypted seed and keystore through the generic API.

**Fix:** Add allowlist of safe keys (`ipfs_config`, `profile_*`). Use dedicated handlers for sensitive data.

#### H3. Seed held in memory for entire session

**Files:**
- `src/main/services/nkn-client-service.ts:20` — `this.seed = seed` as instance field
- `src/main/services/nkn-client-service.ts:84-86` — public `getSeed()` method returns it
- `src/main/services/nkn-client-service.ts:66` — only cleared on disconnect error, not normal disconnect

**Risk:** Memory dump exposes seed. No secure zeroing.

**Fix:** Clear `this.seed` after MultiClient is created. Derive keypair from client object instead. Remove `getSeed()`.

### MEDIUM

#### M1. DevTools open in development mode

**File:** `src/main/index.ts:48` — `mainWindow.webContents.openDevTools()` in dev builds.

**Risk:** All IPC traffic including seed visible. Not a production risk if `isDev` flag works correctly.

#### M2. Sandbox disabled for preload

**File:** `src/main/index.ts:42` — `sandbox: false`.

**Risk:** Preload has full Node.js access. Necessary for current architecture but increases attack surface.

#### M3. No restrictive file permissions on database

**Risk:** DB file inherits OS default umask. On Linux, may be world-readable.

**Fix:** Set `0600` on `dchat.db` after creation.

## What's Done Right

- `contextIsolation: true` — renderer can't directly access Node.js
- `nodeIntegration: false` — no Node.js in renderer
- No seeds in console.log — checked all 80+ log statements
- No hardcoded test seeds or keys in codebase
- CSP configured — no `unsafe-eval`, limited origins
- safeStorage used when available — macOS Keychain / Windows DPAPI
- Keystore is password-encrypted by nkn-sdk internally
- NKN messages are end-to-end encrypted by the SDK
- IPFS files are AES-128-GCM encrypted before upload

## Remediation Plan

| # | Fix | Priority | Effort | Blocked By |
|---|-----|----------|--------|------------|
| 1 | Keep seed in main process only — remove from `WalletInfo`, change `client:connect` to accept keystore+password | Critical | Medium | — |
| 2 | Fail instead of plaintext fallback when safeStorage unavailable | Critical | Small | — |
| 3 | Enable SQLCipher — `better-sqlite3` → `better-sqlite3-multiple-ciphers` | Critical | Medium | — |
| 4 | Allowlist settings keys — block renderer access to sensitive keys | High | Small | — |
| 5 | Zero seed in NknClientService after client init, remove `getSeed()` | High | Small | #1 |
| 6 | Set `0600` file permissions on database | Medium | Small | — |
