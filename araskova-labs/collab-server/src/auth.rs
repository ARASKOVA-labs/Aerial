//! Room access tokens.
//!
//! Format: `v1.<base64url(json claims)>.<base64url(HMAC-SHA256(secret, "v1." + claims))>`
//!
//! Claims: `{ "sub": user id, "room": room id or "*", "exp": unix seconds }`.
//! Tokens are minted by the account backend (or `aerial-collab-server mint`)
//! with the shared secret; this server only verifies them. Keep lifetimes
//! short (minutes) — browsers must pass the token in the WebSocket URL.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

pub const MIN_SECRET_BYTES: usize = 32;
/// Tokens may not claim a lifetime longer than this, whatever `exp` says.
pub const MAX_TOKEN_TTL_SECS: u64 = 24 * 60 * 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Claims {
    pub sub: String,
    pub room: String,
    pub exp: u64,
    #[serde(default)]
    pub iat: u64,
}

#[derive(Debug, PartialEq)]
pub enum AuthError {
    Malformed,
    BadSignature,
    Expired,
    WrongRoom,
}

impl AuthError {
    pub fn reason(&self) -> &'static str {
        match self {
            AuthError::Malformed => "malformed",
            AuthError::BadSignature => "bad_signature",
            AuthError::Expired => "expired",
            AuthError::WrongRoom => "wrong_room",
        }
    }
}

pub struct Verifier {
    keyed: HmacSha256,
}

impl Verifier {
    pub fn new(secret: &[u8]) -> Result<Verifier, String> {
        if secret.len() < MIN_SECRET_BYTES {
            return Err(format!("AERIAL_COLLAB_SECRET must be at least {MIN_SECRET_BYTES} bytes"));
        }
        let keyed = HmacSha256::new_from_slice(secret).map_err(|_| "invalid secret".to_string())?;
        Ok(Verifier { keyed })
    }

    fn mac(&self) -> HmacSha256 {
        self.keyed.clone()
    }

    pub fn mint(&self, claims: &Claims) -> String {
        let body = URL_SAFE_NO_PAD.encode(serde_json::to_vec(claims).unwrap_or_default());
        let signed = format!("v1.{body}");
        let mut mac = self.mac();
        mac.update(signed.as_bytes());
        let sig = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
        format!("{signed}.{sig}")
    }

    pub fn verify(&self, token: &str, room: &str, now: u64) -> Result<Claims, AuthError> {
        if token.len() > 4096 {
            return Err(AuthError::Malformed);
        }
        let mut parts = token.split('.');
        let (Some("v1"), Some(body), Some(sig), None) = (parts.next(), parts.next(), parts.next(), parts.next()) else {
            return Err(AuthError::Malformed);
        };
        let sig = URL_SAFE_NO_PAD.decode(sig).map_err(|_| AuthError::Malformed)?;
        let mut mac = self.mac();
        mac.update(b"v1.");
        mac.update(body.as_bytes());
        // Constant-time comparison.
        mac.verify_slice(&sig).map_err(|_| AuthError::BadSignature)?;

        let claims: Claims = URL_SAFE_NO_PAD
            .decode(body)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .ok_or(AuthError::Malformed)?;
        if claims.exp <= now || (claims.iat > 0 && claims.exp.saturating_sub(claims.iat) > MAX_TOKEN_TTL_SECS) {
            return Err(AuthError::Expired);
        }
        if claims.room != "*" && claims.room != room {
            return Err(AuthError::WrongRoom);
        }
        Ok(claims)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &[u8] = b"0123456789abcdef0123456789abcdef";

    fn claims(room: &str, exp: u64) -> Claims {
        Claims { sub: "user-1".into(), room: room.into(), exp, iat: 900 }
    }

    #[test]
    fn roundtrip() {
        let v = Verifier::new(SECRET).unwrap();
        let t = v.mint(&claims("board1", 2000));
        assert_eq!(v.verify(&t, "board1", 1000).unwrap().sub, "user-1");
    }

    #[test]
    fn rejects_short_secret() {
        assert!(Verifier::new(b"short").is_err());
    }

    #[test]
    fn rejects_tampering_expiry_and_room() {
        let v = Verifier::new(SECRET).unwrap();
        let t = v.mint(&claims("board1", 2000));
        assert_eq!(v.verify(&t, "board1", 2000), Err(AuthError::Expired));
        assert_eq!(v.verify(&t, "board2", 1000), Err(AuthError::WrongRoom));
        // Swap in a forged body with the original signature.
        let forged_body = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims("*", 99_999)).unwrap());
        let sig = t.rsplit('.').next().unwrap();
        assert_eq!(v.verify(&format!("v1.{forged_body}.{sig}"), "board2", 1000), Err(AuthError::BadSignature));
        // A token minted with a different secret.
        let other = Verifier::new(b"ffffffffffffffffffffffffffffffff").unwrap();
        assert_eq!(v.verify(&other.mint(&claims("board1", 2000)), "board1", 1000), Err(AuthError::BadSignature));
        // The old "premium_" bypass no longer works.
        assert_eq!(v.verify("premium_anything", "board1", 1000), Err(AuthError::Malformed));
    }

    #[test]
    fn wildcard_room_and_ttl_cap() {
        let v = Verifier::new(SECRET).unwrap();
        assert!(v.verify(&v.mint(&claims("*", 2000)), "any", 1000).is_ok());
        let long = Claims { iat: 1, exp: 1 + MAX_TOKEN_TTL_SECS + 1, ..claims("*", 0) };
        assert_eq!(v.verify(&v.mint(&long), "any", 2), Err(AuthError::Expired));
    }
}
