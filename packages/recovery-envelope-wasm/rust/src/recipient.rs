//! Admission of recipient keys before any confidential content key is wrapped.

use bc_components::X25519PublicKey;
use bc_envelope::prelude::URDecodable;
use x25519_dalek::{PublicKey, StaticSecret};

pub struct ValidatedRecipient {
    key: X25519PublicKey,
}

impl ValidatedRecipient {
    pub fn read(value: &str) -> Result<Self, &'static str> {
        let key = X25519PublicKey::from_ur_string(value)
            .map_err(|_| "Enter a valid agreement-public-key recipient UR.")?;
        Self::from_key(key)
    }

    fn from_key(key: X25519PublicKey) -> Result<Self, &'static str> {
        // The all-zero scalar is clamped to 2^254. This public probe annihilates
        // the low-order subgroups but not either large prime-order component.
        // dalek also handles RFC 7748's masked/reduced equivalent encodings.
        // No real private recipient key or randomness is needed for admission.
        let probe = StaticSecret::from([0; 32]);
        let shared = probe.diffie_hellman(&PublicKey::from(*key.data()));
        if !shared.was_contributory() {
            return Err("A recipient key must provide contributory X25519 agreement.");
        }
        Ok(Self { key })
    }

    pub fn key(&self) -> &X25519PublicKey {
        &self.key
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_low_order_and_equivalent_encodings() {
        let mut keys = vec![[0; 32], {
            let mut key = [0; 32];
            key[0] = 1;
            key
        }];
        // Field modulus p and p+1 reduce to u=0 and u=1; the top bit is ignored.
        for first in [0xed, 0xee] {
            let mut key = [0xff; 32];
            key[0] = first;
            key[31] = 0x7f;
            keys.push(key);
        }
        for key in keys {
            assert!(ValidatedRecipient::from_key(X25519PublicKey::from_data(key)).is_err());
            let mut masked = key;
            masked[31] |= 0x80;
            assert!(ValidatedRecipient::from_key(X25519PublicKey::from_data(masked)).is_err());
        }
    }

    #[test]
    fn admits_basepoint_and_generated_public_keys() {
        let mut basepoint = [0; 32];
        basepoint[0] = 9;
        assert!(ValidatedRecipient::from_key(X25519PublicKey::from_data(basepoint)).is_ok());
        for byte in [7, 8, 9] {
            let public = PublicKey::from(&StaticSecret::from([byte; 32]));
            assert!(
                ValidatedRecipient::from_key(X25519PublicKey::from_data(*public.as_bytes()))
                    .is_ok()
            );
        }
    }
}
