# ADR 2026-10-06: Encryption at Rest and Post-Quantum Posture

## Status
Accepted

## Context

Boards were stored as plain JSON rows (redb) and plain image files under the
app data directory, protected only by full-disk encryption. Anyone with the
user's files — another local account, a backup, a synced folder, a stolen
unencrypted disk — could read every board.

The request was for "quantum-level encryption". There is no such standard;
the meaningful question is which parts of Aerial would fall to a large
quantum computer:

- **Public-key cryptography** (RSA, elliptic curves) falls to Shor's
  algorithm. Aerial uses none for user data: there is no key exchange in the
  shipped app (the collab relay is not wired into the editor).
- **Symmetric cryptography** is only weakened by Grover's algorithm, which
  halves the effective key length. A 256-bit key keeps 128-bit strength,
  which is why NSA's CNSA 2.0 suite mandates AES-256 and NIST treats 256-bit
  symmetric keys as quantum-safe.

## Decision

1. **Vault (`src-tauri/src/vault.rs`).** XChaCha20-Poly1305, 256-bit key,
   random 192-bit nonce per record (no nonce-reuse risk at any volume). Each
   record carries its location as associated data
   (`element:<board>:<id>`, `asset:<id>`, `legacy:<board>`), so sealed rows
   cannot be moved between boards. Format: `AEV1 ‖ nonce ‖ ciphertext ‖ tag`.
2. **Key custody.** The key is generated with the OS CSPRNG on first run and
   stored in the macOS / iOS Keychain or Windows Credential Manager, never on
   disk beside the data. Other platforms keep the previous behaviour and are
   recorded as a residual risk.
3. **Migration.** On first open with a key, every plaintext row, legacy blob
   and asset is sealed in one pass, then the database is compacted so freed
   pages holding old plaintext are released.
4. **Fail closed, never fail open.** If a key exists but the keychain refuses
   it, the store is *locked*: it never writes plaintext, never generates a
   replacement key (which would orphan the data), and refuses every write —
   including resets and deletes, which a test showed would otherwise wipe
   encrypted boards from an empty-looking UI. The app explains what to do.
5. **Shared files.** `.aerial` files can be sealed with AES-256-GCM under a
   password (see the file-format ADR).

## Consequences

- Stored data is unreadable without the device key; tampering is detected.
- Ad-hoc-signed builds prompt for keychain access after updates ("Always
  Allow"); a Developer ID signature removes the prompt.
- If the keychain item is deleted, the boards cannot be decrypted. Users who
  want a portable backup should save `.aerial` files.
