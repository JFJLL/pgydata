# 1.4.2 Hostile-Test Record

> This is an evidence log, not a completion claim. A test is recorded as passed only where it has been executed successfully.

| Scenario | Expected outcome | Evidence status |
|---|---|---|
| Unsigned or unknown signed envelope | Rejected | Passed by manifest unit tests. |
| Packaged unsigned-local manifest | Rejected | Implemented in packaged entry; Candidate execution still required. |
| Missing signature, altered key ID, outer signed payload, recomputed file hashes | Rejected | Fail-closed path implemented; Candidate hostile tests still required. |
| Direct collection start and history resume | Required authorization precedes engine start | Implemented through `pgyStartRequiredTask`; authenticated Candidate exercise still required. |
| pgy-kol creation | Required provider is explicitly supplied | Implemented statically; Candidate exercise still required. |
| IPC from missing sender, destroyed contents, unauthorized window, subframe or invalid URL | Rejected | IPC guard unit test passed; all entry registrations are wrapped. |
| Native-core executable hash mismatch | Rejected before start | Existing client unit test passed. |
| Native-core Authenticode not Valid | Rejected before start | Implemented; requires signed Windows Candidate test. |
| Receipt append/finalize invalid handle | Rejected | Sidecar command routing changed; Cargo test is pending Windows CI. |
| ASAR normal startup, data tamper, header tamper, app.asar replacement, resources/app fallback | Only normal signed app.asar starts | Not executed; required Windows Candidate test. |
| PE `Integrity/ElectronAsar` resource format | Contains `resources\\app.asar`, `sha256`, and a 64-hex header hash | Passed on an external executable copy using the writer and verifier scripts. |
| Device-key protected storage unavailable | Required initialization rejects and legacy plaintext record is revoked | Implemented; packaged Windows test still required. |

The next hostile-test run must preserve the exact Candidate binary, the pre- and post-tamper SHA-256 values, resource dump, fuse evidence, Authenticode status, native-core metadata, and process exit status. No release is authorized based solely on the static or unit-level checks documented above.

## Final CI evidence — Run 32447202962

The final candidate workflow passed the hostile-path enforcement checks. The backend gate confirmed that required-entry coverage, IPC sender guard coverage, and the packaged manifest fail-closed path are present. The native gate compiled and tested the locked Rust dependency graph and built the Windows core candidate. The desktop gate executed the release-blocker security tests serially on Windows; this set covers sender validation, manifest integrity, native core client protections, Electron fuse and tamper safeguards, required authorization, and receipt-chain persistence. The authorization provider test additionally verifies that `receipt.begin` receives the protected device-bound signing material before cloud task start.

No hostile-path result changes the release boundary: `releaseReady` is **false**, `latest.json` was not changed, and no release or promotion operation was performed.
