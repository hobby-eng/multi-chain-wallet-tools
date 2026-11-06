use zeroize::{Zeroize, Zeroizing};

/// Owns reconstructed entropy until authentication succeeds and its caller takes ownership.
pub(crate) struct RecoverySecret(Zeroizing<Vec<u8>>);

impl RecoverySecret {
    pub(crate) fn new(bytes: Vec<u8>) -> Self {
        Self(Zeroizing::new(bytes))
    }

    pub(crate) fn bytes(&self) -> &[u8] {
        &self.0
    }

    pub(crate) fn take(mut self) -> Vec<u8> {
        std::mem::take(&mut *self.0)
    }
}

impl Drop for RecoverySecret {
    fn drop(&mut self) {
        self.0.as_mut_slice().zeroize();
        // Observe the live initialized slice, before Zeroizing retires/deallocates the vector.
        #[cfg(test)]
        RETIRED.with_borrow_mut(|retired| retired.push(self.0.to_vec()));
    }
}

impl std::fmt::Debug for RecoverySecret {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("RecoverySecret([REDACTED])")
    }
}

#[cfg(test)]
std::thread_local! {
    static RETIRED: std::cell::RefCell<Vec<Vec<u8>>> = const { std::cell::RefCell::new(Vec::new()) };
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Error, recover_secret};

    fn take_retired() -> Vec<Vec<u8>> {
        RETIRED.with_borrow_mut(std::mem::take)
    }

    fn public_shares() -> [Vec<u8>; 2] {
        let secret = vec![0x24; 16];
        let mut digest = vec![0; 16];
        let mac = bc_crypto::hash::hmac_sha256(&digest[4..], &secret);
        digest[..4].copy_from_slice(&mac[..4]);
        [secret, digest]
    }

    #[test]
    fn failed_authentication_wipes_actual_reconstructed_bytes_before_their_owner_is_freed() {
        take_retired();
        let mut shares = public_shares();
        shares[1][0] ^= 1;
        let before = shares.clone();
        assert!(matches!(
            recover_secret(&[255, 254], &shares),
            Err(Error::ChecksumFailure)
        ));
        assert_eq!(take_retired(), vec![vec![0; 16]]);
        assert_eq!(shares, before);
    }

    #[test]
    fn successful_authentication_transfers_live_entropy_without_leaving_a_second_secret_copy() {
        take_retired();
        let shares = public_shares();
        let mut restored = recover_secret(&[255, 254], &shares).unwrap();
        assert_eq!(restored, shares[0]);
        assert_eq!(take_retired(), vec![Vec::<u8>::new()]);
        restored.zeroize();
    }

    #[test]
    fn an_early_return_retires_owned_bytes_and_debug_is_redacted() {
        take_retired();
        let owner = RecoverySecret::new(vec![0x24; 16]);
        assert_eq!(format!("{owner:?}"), "RecoverySecret([REDACTED])");
        drop(owner);
        assert_eq!(take_retired(), vec![vec![0; 16]]);
    }
}
