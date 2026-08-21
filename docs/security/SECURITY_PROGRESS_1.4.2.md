# 1.4.2 Security Progress

> **Revision under remediation:** `591a084dc1567b078d111158bc7735274fa92126`  
> **Status:** **Not release-ready.** This record distinguishes completed code changes from validations still required on a controlled Windows candidate.

## Implemented changes

| Area | Implemented change | Local evidence | Remaining release evidence |
|---|---|---|---|
| Required task authorization | The actual packaged main-process entry initializes a required-mode authorization bridge, then routes collection start and history resume through it. The pgy-kol service receives `authorizationProvider` and `taskAuthMode = required`. | Main-process syntax check passed; authorization provider unit tests passed. | A signed core and authenticated API-backed end-to-end candidate run are required. |
| Device keys and core startup | Required mode rejects unavailable protected storage, revokes legacy plaintext device-key records, checks the core SHA-256 and rejects non-`Valid` Windows Authenticode status before launching the core. | Module syntax check passed. | Verify with a production-signed `magiorix-core.exe` on Windows. |
| Native receipt commands | The sidecar now routes `receipt.append` and `receipt.finalize` to `ReceiptEngine`; the client protocol permits both commands. | Rust compilation could not run locally because the connected Windows environment lacks Cargo; this is a CI blocker rather than a pass. | `cargo test --locked` and sidecar restart/replay tests on Windows CI. |
| SQLite audit schema | Strategy bundle audit writes schema-compatible `items_count`, `points_delta`, `status`, `error_code`, and `ip_hash` fields rather than `item_count` and `detail`. | Backend test suite: 55 passed. Targeted migration/strategy tests: 3 passed. | Add the full device-registration through task-completion SQLite integration scenario. |
| Asset manifests | Packaged mode requires schema v2, a trusted key, non-empty signature, signed payload, a valid Ed25519 signature, and version agreement. `unsigned-local` is accepted only when not packaged. | Manifest and authorization security unit tests: 13 passed. | Build a signed Candidate manifest and run deletion/key-ID/payload relocation/tamper tests. |
| IPC | All `ipcMain.handle` and `ipcMain.on` registrations in the packaged entry are wrapped with the common sender guard. | IPC guard unit test passed; main-process syntax check passed. | Dynamic smoke coverage for every sensitive channel in a packaged candidate. |
| Electron and PE Integrity | The checked runtime was replaced with Electron 35.7.5. A `resedit`-based script writes and verifies `Integrity` / `ElectronAsar` using the SHA-256 of `@electron/asar` raw header. | Resource write/read was validated on a worktree-external executable copy. | Build and sign a Candidate, then execute normal and tampered-start tests. |

## Controlled build and test limits

The connected Windows environment has no Cargo executable. An attempt to install Rust through the system package source failed because the local package source is broken. The repository now includes Windows CI gates for `cargo test --locked`, core build, Electron version verification, and build-script syntax. The CI run has not yet been created because this remediation has not yet been committed and pushed.

Electron’s advisory states that applications using the relevant fuses have no application-side workaround and must use a patched Electron release.[1] Electron’s Windows ASAR Integrity specification requires a PE resource of type `Integrity` and name `ElectronAsar`, whose JSON binds `resources\\app.asar` to the SHA-256 of the raw ASAR header.[2]

## Release decision

`releaseReady` is **false** until all of the following are supplied by a controlled Windows candidate: signed core payload and metadata, successful Authenticode verification, real native receipt completion/restart tests, Candidate startup/tamper tests, signed asset-manifest hostile tests, and a passing remote CI run.

## References

[1]: https://github.com/electron/electron/security/advisories/GHSA-vmqv-hx8q-j7mg "Electron GHSA-vmqv-hx8q-j7mg"
[2]: https://www.electronjs.org/docs/latest/tutorial/asar-integrity "Electron ASAR Integrity"
