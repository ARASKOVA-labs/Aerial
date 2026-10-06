# ADR 2026-10-06: Stable Code Signing for Keychain Access

## Status
Accepted

## Context

The storage key lives in the macOS Keychain (`com.araskova.aerial`). macOS
trusts a Keychain item's callers by code signature. `tauri build` without a
signing identity produces an ad-hoc signature, which is only the hash of the
binary: each rebuild is a different app to the Keychain, so even "Always
Allow" is forgotten and the login password is requested on every launch of a
new build. The installed 3.0.0 build was ad-hoc signed.

## Decision

1. Build releases with `scripts/build-mac.sh`, which signs with a certificate
   (Developer ID Application if present, else Apple Development, or
   `APPLE_SIGNING_IDENTITY`) and refuses to fall back to ad-hoc. With a
   certificate the designated requirement is the bundle identifier plus the
   certificate, which does not change between builds.
2. Keep the key in the Keychain with the default per-app access list. We did
   not widen the item's ACL to "any application": that would let every
   process of the user read the key and defeat the purpose of the Keychain.
3. The app never asks for or handles the user's password; the prompt is
   macOS's.

## Consequences

- After installing the first certificate-signed build, macOS asks once more
  (the old ad-hoc build is what the item trusts); choose **Always Allow**.
  Later rebuilds signed by the same certificate do not prompt.
- Changing certificate (e.g. moving from Apple Development to Developer ID)
  causes one more prompt.
- Anyone building from source without a certificate gets the prompt after
  each rebuild; the script says so rather than silently going ad-hoc.
