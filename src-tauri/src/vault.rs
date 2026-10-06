//! Encryption at rest for board rows and image assets.
//!
//! Every record is sealed with XChaCha20-Poly1305 under a 256-bit key that
//! lives in the operating system's credential store (macOS / iOS Keychain,
//! Windows Credential Manager), never next to the data. 256-bit symmetric
//! keys are what CNSA 2.0 requires for resistance to quantum attack: Grover's
//! search halves the effective strength to 128 bits, and nothing here depends
//! on public-key cryptography that Shor's algorithm would break.
//!
//! Sealed record: `b"AEV1" ‖ 24-byte random nonce ‖ ciphertext ‖ 16-byte tag`.
//! Each record is bound to where it belongs (e.g. `element:<board>:<id>`) as
//! associated data, so sealed rows cannot be swapped between boards.
//!
//! Records without the magic prefix are legacy plaintext: still readable, and
//! re-sealed by the one-time migration in `storage`.
//!
//! If the credential store refuses access to an existing key the vault is
//! *locked*: it never falls back to plaintext and never replaces the key (that
//! would orphan existing data). Writes fail with a clear error instead.

use std::borrow::Cow;

use chacha20poly1305::aead::{Aead, AeadCore, KeyInit, OsRng, Payload};
use chacha20poly1305::{Key, XChaCha20Poly1305, XNonce};

const MAGIC: &[u8; 4] = b"AEV1";
const NONCE_LEN: usize = 24;
const KEY_LEN: usize = 32;
const KEYCHAIN_SERVICE: &str = "com.araskova.aerial";
const KEYCHAIN_ACCOUNT: &str = "storage-key-v1";

pub const LOCKED_MESSAGE: &str = "Aerial could not unlock its storage key in the system keychain";

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VaultState {
    /// Records are sealed with the device key.
    Encrypted,
    /// A key exists but the credential store refused access; writes are refused.
    Locked,
    /// No credential store on this platform; records are stored as before.
    Unavailable,
}

pub struct Vault {
    cipher: Option<XChaCha20Poly1305>,
    state: VaultState,
}

impl Vault {
    /// Opens the device vault, creating its key on first run.
    pub fn open() -> Vault {
        match load_or_create_key() {
            KeyOutcome::Key(key) => Vault::with_key(&key),
            KeyOutcome::Locked => {
                tracing::error!(target: "audit", "storage key exists but the keychain refused access; storage is locked");
                Vault { cipher: None, state: VaultState::Locked }
            }
            KeyOutcome::Unavailable => {
                tracing::warn!(target: "audit", "no OS credential store; storage is not encrypted at rest");
                Vault { cipher: None, state: VaultState::Unavailable }
            }
        }
    }

    pub fn with_key(key: &[u8; KEY_LEN]) -> Vault {
        Vault { cipher: Some(XChaCha20Poly1305::new(Key::from_slice(key))), state: VaultState::Encrypted }
    }

    #[cfg(test)]
    pub fn plaintext() -> Vault {
        Vault { cipher: None, state: VaultState::Unavailable }
    }

    #[cfg(test)]
    pub fn locked() -> Vault {
        Vault { cipher: None, state: VaultState::Locked }
    }

    pub fn state(&self) -> VaultState {
        self.state
    }

    /// Every mutation (inserts *and* deletes) must pass this first: a locked
    /// store shows the user no boards, and a reset or delete issued from that
    /// empty view would otherwise wipe the encrypted data.
    pub fn ensure_writable(&self) -> Result<(), String> {
        if self.state == VaultState::Locked {
            Err(LOCKED_MESSAGE.to_string())
        } else {
            Ok(())
        }
    }

    pub fn is_sealed(bytes: &[u8]) -> bool {
        bytes.len() >= MAGIC.len() + NONCE_LEN && bytes.starts_with(MAGIC)
    }

    /// Seals `plain` for `context`. Plaintext passes through only when the
    /// platform has no credential store; a locked vault refuses.
    pub fn seal<'a>(&self, context: &str, plain: &'a [u8]) -> Result<Cow<'a, [u8]>, String> {
        let Some(cipher) = &self.cipher else {
            return match self.state {
                VaultState::Locked => Err(LOCKED_MESSAGE.to_string()),
                _ => Ok(Cow::Borrowed(plain)),
            };
        };
        let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng);
        let sealed = cipher
            .encrypt(&nonce, Payload { msg: plain, aad: context.as_bytes() })
            .map_err(|_| "encryption failed".to_string())?;
        let mut out = Vec::with_capacity(MAGIC.len() + NONCE_LEN + sealed.len());
        out.extend_from_slice(MAGIC);
        out.extend_from_slice(&nonce);
        out.extend_from_slice(&sealed);
        Ok(Cow::Owned(out))
    }

    /// Opens a record sealed for `context`; legacy plaintext passes through.
    pub fn open_record<'a>(&self, context: &str, bytes: &'a [u8]) -> Result<Cow<'a, [u8]>, String> {
        if !Vault::is_sealed(bytes) {
            return Ok(Cow::Borrowed(bytes));
        }
        let cipher = self.cipher.as_ref().ok_or_else(|| LOCKED_MESSAGE.to_string())?;
        let (nonce, body) = bytes[MAGIC.len()..].split_at(NONCE_LEN);
        cipher
            .decrypt(XNonce::from_slice(nonce), Payload { msg: body, aad: context.as_bytes() })
            .map(Cow::Owned)
            .map_err(|_| {
                tracing::error!(target: "audit", "a stored record failed authentication");
                "stored data failed its integrity check".to_string()
            })
    }
}

enum KeyOutcome {
    Key([u8; KEY_LEN]),
    Locked,
    Unavailable,
}

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "windows"))]
fn load_or_create_key() -> KeyOutcome {
    use chacha20poly1305::aead::rand_core::RngCore;

    let entry = match keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT) {
        Ok(e) => e,
        Err(e) => {
            tracing::warn!(error = %e, "credential store unavailable");
            return KeyOutcome::Unavailable;
        }
    };
    match entry.get_secret() {
        Ok(secret) if secret.len() == KEY_LEN => {
            let mut key = [0u8; KEY_LEN];
            key.copy_from_slice(&secret);
            KeyOutcome::Key(key)
        }
        Ok(_) => {
            tracing::error!(target: "audit", "storage key in the keychain has the wrong length");
            KeyOutcome::Locked
        }
        Err(keyring::Error::NoEntry) => {
            let mut key = [0u8; KEY_LEN];
            OsRng.fill_bytes(&mut key);
            match entry.set_secret(&key) {
                Ok(()) => {
                    tracing::info!(target: "audit", "created storage encryption key in the keychain");
                    KeyOutcome::Key(key)
                }
                Err(e) => {
                    tracing::warn!(error = %e, "could not store a new storage key");
                    KeyOutcome::Unavailable
                }
            }
        }
        Err(e) => {
            tracing::error!(error = %e, "keychain refused access to the storage key");
            KeyOutcome::Locked
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "windows")))]
fn load_or_create_key() -> KeyOutcome {
    KeyOutcome::Unavailable
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: [u8; 32] = [7; 32];

    #[test]
    fn seal_open_roundtrip_and_hides_content() {
        let v = Vault::with_key(&KEY);
        let sealed = v.seal("element:b:1", b"{\"text\":\"secret plan\"}").unwrap();
        assert!(Vault::is_sealed(&sealed));
        assert!(!sealed.windows(6).any(|w| w == b"secret"));
        assert_eq!(&*v.open_record("element:b:1", &sealed).unwrap(), b"{\"text\":\"secret plan\"}");
    }

    #[test]
    fn nonces_are_unique() {
        let v = Vault::with_key(&KEY);
        assert_ne!(v.seal("c", b"same").unwrap(), v.seal("c", b"same").unwrap());
    }

    #[test]
    fn records_are_bound_to_their_place() {
        let v = Vault::with_key(&KEY);
        let sealed = v.seal("element:a:1", b"x").unwrap();
        assert!(v.open_record("element:b:1", &sealed).is_err());
        let mut tampered = sealed.into_owned();
        *tampered.last_mut().unwrap() ^= 1;
        assert!(v.open_record("element:a:1", &tampered).is_err());
    }

    #[test]
    fn wrong_key_cannot_open() {
        let sealed = Vault::with_key(&KEY).seal("c", b"x").unwrap().into_owned();
        assert!(Vault::with_key(&[8; 32]).open_record("c", &sealed).is_err());
    }

    #[test]
    fn legacy_plaintext_still_reads() {
        let v = Vault::with_key(&KEY);
        assert_eq!(&*v.open_record("c", b"{\"id\":1}").unwrap(), b"{\"id\":1}");
    }

    #[test]
    fn locked_vault_refuses_writes_and_sealed_reads() {
        let sealed = Vault::with_key(&KEY).seal("c", b"x").unwrap().into_owned();
        let locked = Vault::locked();
        assert!(locked.seal("c", b"x").is_err());
        assert!(locked.open_record("c", &sealed).is_err());
        assert_eq!(&*locked.open_record("c", b"plain").unwrap(), b"plain");
        assert_eq!(&*Vault::plaintext().seal("c", b"plain").unwrap(), b"plain");
    }
}
