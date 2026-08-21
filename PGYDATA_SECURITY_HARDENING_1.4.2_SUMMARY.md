# PGYDATA 1.4.2 Security Hardening Summary

## Scope and branch controls

This remediation stays on `codex/security-hardening-1.4.2` at version `1.4.2`. It does not rebase, merge `master`, force-push, modify `latest.json`, publish a release, promote a release, or overwrite 1.4.1 artifacts.

## Main remediation work

The actual packaged Electron entry now contains a required-mode task-authorization bridge and sends the collection start and history-resume paths through that bridge. Pgy-kol is instantiated with the same authorization provider and an explicit `required` mode. The bridge creates `DeviceKeyManager`, `NativeCoreClient`, `AuthorizationGate`, and `TaskAuthorizationProvider` when a paid task is requested; a missing core, missing metadata, bad SHA-256, unavailable protected storage, or invalid Authenticode state fails closed.

The Rust sidecar now contains `receipt.append` and `receipt.finalize` command paths backed by `ReceiptEngine`, and the JavaScript core client permits both commands. Strategy-bundle audit logging was changed to the schema-compatible fields. Packaged asset verification requires a v2, trusted, signed envelope and matching resource version. IPC registrations are wrapped by the sender guard. The runtime is updated to Electron 35.7.5 and the build chain now writes the Windows `Integrity/ElectronAsar` resource before fuses and signing.

## Evidence collected locally

| Validation | Result |
|---|---|
| Back-end test suite | 55 passed |
| Migration and strategy bundle tests | 3 passed |
| Authorization, receipt, manifest, and IPC unit group | 13 passed |
| JavaScript syntax checks for modified modules | Passed |
| PE resource writer and reader on external executable copy | Passed |
| Electron runtime version file | `35.7.5` |
| Rust `cargo test --locked` | Not executed locally: Cargo unavailable |
| Signed Candidate startup and tamper matrix | Not executed locally |

## Remaining release gates

The branch is **not release-ready**. A normal push will trigger the new Windows CI workflow, but the following are mandatory before a release decision: Rust build and tests, signed core validation, actual Candidate build, Authenticode verification, native receipt restart/replay tests, real SQLite lifecycle test, signed-manifest hostile tests, and normal/tampered Candidate startup checks. The project security documentation must be updated again with immutable output paths, hashes, CI run ID, and test results after those executions.

## Final CI evidence — Run 32447202962

Commit `de124f1466b9c4403c1d6c1dfe60f105bb277b52` completed the final GitHub Actions security candidate workflow successfully. All four jobs passed: backend and Node checks, Windows desktop security tests, Windows native-core locked tests and candidate build, and Windows candidate-integrity checks. The implemented receipt path now uses required authorization to retrieve protected device-bound Ed25519 material, starts `ReceiptEngine` through the authenticated native `receipt.begin` command, and routes `receipt.append` and `receipt.finalize` to that initialized engine.

The branch remains a non-published candidate. `releaseReady` is **false**. `latest.json` was not modified; no Release, promotion, or overwrite of any 1.4.1 artifact occurred.
