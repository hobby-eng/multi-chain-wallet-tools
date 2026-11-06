use zeroize::{Zeroize, ZeroizeOnDrop};

use crate::{Error, MAX_SECRET_LEN, MIN_SECRET_LEN, Result};

/// A secret to be split into shares.
#[derive(Clone, Eq, PartialEq)]
pub struct Secret(Vec<u8>);

impl Secret {
    /// Creates a new `Secret` instance with the given data.
    ///
    /// # Arguments
    ///
    /// * `data` - The secret data to be split into shares.
    ///
    /// # Errors
    ///
    /// Returns an error if the length of the secret is less than
    /// `MIN_SECRET_LEN`, greater than `MAX_SECRET_LEN`, or not even.
    pub fn new<T>(data: T) -> Result<Self>
    where
        T: AsRef<[u8]>,
    {
        let data = data.as_ref();
        let len = data.len();
        if len < MIN_SECRET_LEN {
            return Err(Error::SecretTooShort);
        }
        if len > MAX_SECRET_LEN {
            return Err(Error::SecretTooLong);
        }
        if len & 1 != 0 {
            return Err(Error::SecretLengthNotEven);
        }
        Ok(Self(data.to_vec()))
    }

    /// Returns the length of the secret.
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// Returns `true` if the secret is empty.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Returns a reference to the secret data.
    pub fn data(&self) -> &[u8] {
        &self.0
    }
}

impl AsRef<[u8]> for Secret {
    /// Returns a reference to the secret data.
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

impl Zeroize for Secret {
    fn zeroize(&mut self) {
        self.0.zeroize();
    }
}

impl ZeroizeOnDrop for Secret {}

impl Drop for Secret {
    fn drop(&mut self) {
        #[cfg(test)]
        let original_length = self.0.len();
        self.zeroize();
        // Observe the live owner only; never dereference storage after it is freed.
        #[cfg(test)]
        tests::record_drop(original_length, self.0.len());
    }
}

impl std::fmt::Debug for Secret {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Secret([REDACTED])")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    std::thread_local! {
        static DROPS: RefCell<Vec<(usize, usize)>> = const { RefCell::new(Vec::new()) };
    }

    pub(super) fn record_drop(before: usize, after: usize) {
        DROPS.with_borrow_mut(|drops| drops.push((before, after)));
    }

    fn take_drops() -> Vec<(usize, usize)> {
        DROPS.with_borrow_mut(std::mem::take)
    }

    #[test]
    fn wipes_each_owner_and_clone_on_success_or_early_error() {
        fn scoped(fail: bool) -> Result<()> {
            let secret = Secret::new([0x24; 16])?;
            let cloned = secret.clone();
            assert_eq!(secret, cloned);
            assert_eq!(format!("{secret:?}"), "Secret([REDACTED])");
            if fail {
                return Err(Error::ShareSetInvalid);
            }
            Ok(())
        }
        for fail in [false, true] {
            take_drops();
            assert_eq!(scoped(fail).is_err(), fail);
            assert_eq!(take_drops(), vec![(16, 0), (16, 0)]);
        }
    }

    #[test]
    fn partial_deserialization_wipes_the_already_owned_share() {
        take_drops();
        let mut first = vec![0; 5];
        first.extend_from_slice(&[0x24; 16]);
        let invalid = vec![0];
        let result = crate::sskr_combine(&[first, invalid]);
        assert!(matches!(result, Err(Error::ShareLengthInvalid)));
        assert_eq!(take_drops(), vec![(16, 0)]);
    }

    #[test]
    fn reconstruction_keeps_the_literal_secret_and_wipes_internal_clones() {
        take_drops();
        let mut share = vec![0; 5];
        share.extend_from_slice(&[0x24; 16]);
        let recovered = crate::sskr_combine(&[share]).unwrap();
        assert_eq!(recovered.data(), &[0x24; 16]);
        let internal = take_drops();
        assert!(!internal.is_empty());
        assert!(
            internal
                .iter()
                .all(|&(before, after)| before == 16 && after == 0)
        );
        drop(recovered);
        assert_eq!(take_drops(), vec![(16, 0)]);
    }

    #[test]
    fn explicit_zeroize_clears_an_owner_without_changing_its_clone() {
        let mut secret = Secret::new([0x24; 16]).unwrap();
        let cloned = secret.clone();
        secret.zeroize();
        assert!(secret.is_empty());
        assert_eq!(cloned.data(), &[0x24; 16]);
    }
}
