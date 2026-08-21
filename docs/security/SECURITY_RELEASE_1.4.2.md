# 1.4.2 Security Release Status

## Current determination

Version **1.4.2 remains a remediation candidate and is not approved for release**. The worktree retains version `1.4.2`; no release was created, no promotion was performed, and `latest.json` was not modified.

| Release control | Current state |
|---|---|
| Version | `1.4.2` retained |
| Branch | `codex/security-hardening-1.4.2` |
| Force push / rebase / merge master | Not performed |
| `latest.json` | Not modified |
| 1.4.1 artifacts | Not overwritten |
| GitHub Release / promotion | Not performed |
| `releaseReady` | **false** |

## Candidate gates before release readiness

A release decision requires a signed Windows Candidate containing `magiorix-core.exe` and `magiorix-core.metadata.json`, with the core included in the installer and uninstall manifests, upgrade-lock handling, SHA-256 list, and Authenticode signing list. The candidate must start only with the signed app.asar, a valid `Integrity/ElectronAsar` PE resource, enabled fuses, and valid executable signatures.

The Candidate must also demonstrate successful required-mode authorization for every paid entry, real native receipt finalization and replay/restart resistance, a real SQLite authorization lifecycle, and rejection of missing or altered asset-manifest signatures. These gates are intentionally not inferred from source changes or unit tests.

## Current verification evidence

The Electron runtime now records `35.7.5`, a patched release for the ASAR Integrity bypass. The PE resource writer and reader successfully produced and read a resource of type `Integrity`, name `ElectronAsar`, with an entry for `resources\\app.asar`. Back-end tests passed 55 tests; targeted migration/strategy tests passed 3 tests; and the authorization, receipt-chain, manifest, and IPC unit group passed 13 tests.

The connected Windows environment could not run Cargo because Rust is not installed and its package source is broken. Therefore no local native-core compile, Candidate installer, Authenticode verification, or actual startup/tamper result is claimed here. The Windows CI workflow added in this branch will execute these checks after a normal push.

## Relevant external requirements

Electron requires the ASAR header hash to be written to the Windows `Integrity` / `ElectronAsar` resource; applications must update to a patched Electron release for the cited ASAR Integrity issue.[1] [2]

## References

[1]: https://www.electronjs.org/docs/latest/tutorial/asar-integrity "Electron ASAR Integrity"
[2]: https://github.com/electron/electron/security/advisories/GHSA-vmqv-hx8q-j7mg "Electron GHSA-vmqv-hx8q-j7mg"
