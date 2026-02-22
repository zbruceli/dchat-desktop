# Releasing D-Chat Desktop

This document describes how to build, package, and release D-Chat Desktop for macOS, Windows, and Linux.

## Release Phases

| Phase | What | Cost | Status |
|-------|------|------|--------|
| 1 — Unsigned | GitHub Actions builds unsigned binaries, publishes to GitHub Releases | Free | **Current** |
| 2 — macOS Signed | Code signing + notarization via Apple Developer Program | $99/yr | Planned |
| 3 — Windows Signed | Code signing via Azure Trusted Signing or EV certificate | $9.99/mo+ | Planned |
| 4 — Auto-update | electron-updater checks GitHub Releases for new versions | Free | Planned |

### Phase 1: Unsigned Releases (Current)

GitHub Actions builds the app for all three platforms on every tag push (`v*.*.*`). Artifacts are uploaded to a GitHub Release as draft.

**User experience:**
- macOS: Users must right-click → Open (or `xattr -cr`) to bypass Gatekeeper
- Windows: SmartScreen will show "Unknown publisher" warning — users click "More info" → "Run anyway"
- Linux: No signing required, works as-is

### Phase 2: macOS Code Signing & Notarization

**Requirements:**
- [Apple Developer Program](https://developer.apple.com/programs/) membership ($99/year)
- Developer ID Application certificate (for distribution outside the App Store)
- Developer ID Installer certificate (for `.pkg` installers, optional)
- Xcode command-line tools (for `codesign` and `notarytool`)

**What it provides:**
- Gatekeeper passes without user workaround
- App is notarized by Apple (malware scanned)
- Hardened runtime enforced

**electron-builder config additions:**
```yaml
mac:
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
afterSign: scripts/notarize.js
```

**Entitlements needed** (`build/entitlements.mac.plist`):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.device.audio-input</key><true/>
</dict>
</plist>
```

**GitHub Actions secrets needed:**
| Secret | Description |
|--------|-------------|
| `APPLE_ID` | Apple Developer account email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | 10-character team ID |
| `CSC_LINK` | Base64-encoded `.p12` certificate |
| `CSC_KEY_PASSWORD` | Password for the `.p12` certificate |

### Phase 3: Windows Code Signing

**Option A: Azure Trusted Signing** (recommended, cheapest)
- Azure subscription + Trusted Signing resource ($9.99/month)
- Identity validation (organization or individual)
- electron-builder has built-in support via `win.azureSignOptions`

**Option B: SSL.com EV Certificate**
- EV code signing certificate (~$350+/year)
- Requires hardware token (USB) or cloud signing
- Immediate SmartScreen reputation (EV certs bypass SmartScreen from day one)

**Option C: OV Certificate**
- Standard code signing certificate (~$200+/year)
- SmartScreen reputation builds over time (users may see warnings initially)

**GitHub Actions secrets needed (Azure Trusted Signing):**
| Secret | Description |
|--------|-------------|
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_CLIENT_ID` | Azure AD app registration client ID |
| `AZURE_CLIENT_SECRET` | Azure AD app registration secret |
| `AZURE_CODE_SIGNING_ACCOUNT` | Trusted Signing account name |
| `AZURE_CERT_PROFILE` | Certificate profile name |

### Phase 4: Auto-Update

Once signed releases are available, enable electron-updater:

```yaml
# electron-builder.yml
publish:
  provider: github

# In main process code:
import { autoUpdater } from 'electron-updater';
autoUpdater.checkForUpdatesAndNotify();
```

Auto-update requires signed builds on macOS (code signing) and is recommended on Windows.

## Cost Summary

| Item | Cost | When Needed |
|------|------|-------------|
| GitHub Actions | Free (2,000 min/mo for public repos) | Phase 1 |
| Apple Developer Program | $99/year | Phase 2 |
| Azure Trusted Signing | $9.99/month (~$120/year) | Phase 3 |
| **Total (all platforms signed)** | **~$220/year** | Phases 2+3 |

## How to Create a Release

### 1. Bump version

```bash
# Edit version in package.json
npm version patch   # 0.1.0 → 0.1.1
# or
npm version minor   # 0.1.0 → 0.2.0
# or
npm version major   # 0.1.0 → 1.0.0
```

This updates `package.json` and creates a git commit + tag.

### 2. Push the tag

```bash
git push origin main --follow-tags
```

### 3. GitHub Actions builds

The `release.yml` workflow triggers on tag push (`v*.*.*`):
- Builds macOS (x64 + arm64), Windows (x64), and Linux (x64) in parallel
- Uploads artifacts to a draft GitHub Release

### 4. Publish the release

1. Go to the repository's **Releases** page on GitHub
2. Find the draft release created by the workflow
3. Edit the release notes (auto-generated from commits)
4. Click **Publish release**

## Local Test Build

Test the packaging locally before pushing a release:

```bash
# Build for current platform
npm run package

# Build for specific platform
npm run package:mac     # macOS (DMG + ZIP)
npm run package:win     # Windows (NSIS + portable)
npm run package:linux   # Linux (AppImage + DEB)

# Output goes to release/ directory
ls release/
```

### Verifying the build

**macOS:**
```bash
# Check the .app was created
ls release/mac-arm64/  # or mac/ for x64

# Open the DMG
open release/*.dmg
```

**Windows (from Windows or Wine):**
```bash
# Check installer was created
ls release/*.exe
```

**Linux:**
```bash
# Check AppImage was created
ls release/*.AppImage

# Test it
chmod +x release/*.AppImage
./release/*.AppImage
```

## Native Module Notes

D-Chat uses three native Node.js modules that need special handling:

| Module | Purpose | asarUnpack |
|--------|---------|------------|
| `better-sqlite3-multiple-ciphers` | SQLCipher database | Yes — `.node` binaries |
| `sharp` | Image processing | Yes — native binaries |
| `@ffmpeg-installer/ffmpeg` | Audio conversion | Yes — ffmpeg binary |

These are configured in `electron-builder.yml` under `asarUnpack` to be extracted outside the ASAR archive at runtime.

### Rebuilding native modules

Native modules must be compiled for Electron's Node.js version. This is handled by:
- `@electron/rebuild` during development (`npx electron-rebuild`)
- `electron-builder` during packaging (automatic rebuild)

If you hit native module errors after updating Electron:
```bash
npx electron-rebuild -f -w better-sqlite3-multiple-ciphers
npx electron-rebuild -f -w sharp
```

## GitHub Actions Workflow

The release workflow (`.github/workflows/release.yml`) runs three parallel jobs:

```
Tag push (v*.*.*) → ┬─ build-macos (x64 + arm64) ─→ DMG, ZIP
                     ├─ build-windows (x64)        ─→ NSIS installer, portable EXE
                     └─ build-linux (x64)          ─→ AppImage, DEB
                                                        ↓
                                                   Draft GitHub Release
```

All jobs use `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` which is automatically provided by GitHub Actions — no manual secret setup needed for Phase 1.

## Troubleshooting

### macOS: "App is damaged and can't be opened"
```bash
xattr -cr /Applications/D-Chat\ Desktop.app
```
This removes the quarantine attribute. Required for unsigned builds (Phase 1).

### Windows: SmartScreen blocks the installer
Click "More info" → "Run anyway". This is expected for unsigned builds (Phase 1).

### Build fails on native modules
```bash
# Clear node_modules and rebuild
rm -rf node_modules
npm ci
npx electron-rebuild -f -w better-sqlite3-multiple-ciphers
npx electron-rebuild -f -w sharp
```

### GitHub Actions build fails
- Check that `package.json` version matches the git tag
- Ensure native module dependencies are available for the target platform
- Review the workflow logs for specific error messages
