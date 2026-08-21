# 1.4.2 Release Blockers — Reproduction Baseline

> **Baseline revision:** `591a084dc1567b078d111158bc7735274fa92126`  
> **Branch:** `codex/security-hardening-1.4.2`  
> **Recorded:** 2026-08-21 (GMT+8)  
> **Scope:** Static tracing of the actual packaged main-process entry, plus targeted source and build-chain inspection. This document records the pre-fix state; completion claims must be replaced only after executable verification.

## Reproduction Summary

| ID | Blocker | Reproduction evidence at baseline | Status |
|---:|---|---|---|
| 1 | Collection task start bypasses authorization | `app-source/dist-electron/index.js` contains `scraper:task:start` handler path calling `pgyCollectionHistory.createTask(t).then(() => ge.startTask(t))`. No authorization-provider symbol is present in the actual entry. | Confirmed |
| 2 | History resume bypasses authorization | `F.handle(W.history.resumeTask, ...)` sets running state then calls `ge.startTask({ ...n.payload, pendingCharges: n.pendingCharges })`. | Confirmed |
| 3 | pgy-kol omits authorization provider | `pgy-kol-ipc.mjs` and packaged entry have no `authorizationProvider` or `taskAuthMode` wiring. | Confirmed |
| 4 | Required primitives are not initialized in main entry | `NativeCoreClient`, `DeviceKeyManager`, `AuthorizationGate`, and `TaskAuthorizationProvider` exist as standalone modules but none is referenced by the actual `dist-electron/index.js` entry. | Confirmed |
| 5 | Native core is absent from installer/runtime payload | `build-magiorix-windows-installer.ps1` contains no `build-magiorix-core.ps1`, `magiorix-core.exe`, or metadata handling. | Confirmed |
| 6 | Receipt sidecar commands fail | Rust `ReceiptEngine` is implemented in `native/magiorix-core/src/lib.rs`, but `main.rs` does not initialize it and routes `receipt.append` and `receipt.finalize` to `InvalidHandle`. | Confirmed |
| 7 | Strategy audit SQL mismatches schema | `strategy-bundle-service.js` writes `item_count` and `detail`; the migration defines `items_count` and does not define those two columns. | Confirmed |
| 8 | Asset signature path is not fail closed | The bundled `pgyVerifyAssets` accepts a normal manifest path; the envelope verifier allows an `unsigned-local` path and required/candidate restrictions are not wired into the packaged main entry. | Confirmed |
| 9 | No Windows PE ASAR resource implementation | The build chain contains no `getRawHeader`, `ElectronAsar`, or Windows resource-writing implementation. | Confirmed |
| 10 | IPC guard is defined but not applied | `electron-main/ipc-guard.mjs` exists; sensitive handlers in the bundled entry and `pgy-kol-ipc.mjs` register directly without a shared sender-guard call. | Confirmed |
| 11 | Electron runtime predates the ASAR Integrity fix | The review baseline uses Electron `33.0.2`; Electron’s advisory requires a patched release and gives no app-side workaround.[1] | Confirmed |
| 12 | Device private key can degrade to plaintext | `device-key-manager.mjs` persists `privateKeyPem`; required/packaged initialization does not reject unavailable `safeStorage` or migrate/revoke legacy plaintext records. | Confirmed |

## Trace Commands

The baseline was produced from the target worktree by searching the actual packaged main entry and named source/build files. The following key static traces are deterministic and should be rerun after each remediation:

```powershell
# Direct task start and history resume bypasses
$raw = [IO.File]::ReadAllText('app-source/dist-electron/index.js')
$raw.IndexOf('ge.startTask')
$raw.IndexOf('W.history.resumeTask')

# Missing main-entry initialization symbols
'NativeCoreClient','DeviceKeyManager','AuthorizationGate','TaskAuthorizationProvider' |
  ForEach-Object { "$($_)=$($raw.IndexOf($_))" }

# Audit-schema mismatch
Select-String red-magic-api/lib/strategy-bundle-service.js -Pattern 'item_count|detail'
Select-String red-magic-api/lib/database-migrations.js -Pattern 'items_count'

# Build-chain omissions
Select-String scripts/build-magiorix-windows-installer.ps1 -Pattern 'magiorix-core|ElectronAsar|getRawHeader'
```

## ASAR Integrity Security Requirement

Electron’s Windows format is an `Integrity` resource named `ElectronAsar`; its JSON value must bind `resources\\app.asar` to the SHA-256 of the raw ASAR header. The hash must be calculated with `@electron/asar`’s `getRawHeader` before fuses and Authenticode signing are applied.[2]

## References

[1]: https://github.com/electron/electron/security/advisories/GHSA-vmqv-hx8q-j7mg "Electron GHSA-vmqv-hx8q-j7mg"
[2]: https://www.electronjs.org/docs/latest/tutorial/asar-integrity "Electron ASAR Integrity documentation"
