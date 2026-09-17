//! Narrow WebAssembly boundary around the pinned `sharks` GF(256) implementation.
//! Encoding, set metadata, and checksums remain in the TypeScript recovery package.

use rand_chacha::ChaCha20Rng;
use rand_core::SeedableRng;
use sharks::{Share, Sharks};
use wasm_bindgen::prelude::*;
use zeroize::Zeroize;

const MIN_SECRET_BYTES: usize = 16;
const MAX_SECRET_BYTES: usize = 32;

fn validate_threshold(threshold: u8, count: u8) -> Result<(), JsValue> {
    if threshold < 2 {
        return Err(JsValue::from_str("Shamir threshold must be at least 2."));
    }
    if count < threshold {
        return Err(JsValue::from_str("Shamir share count must be at least the threshold."));
    }
    Ok(())
}

/// Returns `count` concatenated `sharks::Share` byte strings. Each serialized
/// share is exactly `secret.len() + 1` bytes, with the x-coordinate included.
#[wasm_bindgen]
pub fn split_shamir_shares(
    mut secret: Vec<u8>,
    threshold: u8,
    count: u8,
    mut random_seed: Vec<u8>,
) -> Result<Vec<u8>, JsValue> {
    let result = (|| {
        validate_threshold(threshold, count)?;
        if !(MIN_SECRET_BYTES..=MAX_SECRET_BYTES).contains(&secret.len()) || secret.len() % 4 != 0 {
            return Err(JsValue::from_str(
                "Shamir secret must be 16, 20, 24, 28, or 32 bytes of BIP39 entropy.",
            ));
        }
        let mut seed: [u8; 32] = random_seed.as_slice().try_into().map_err(|_| {
            JsValue::from_str("Shamir randomness must contain exactly 32 bytes.")
        })?;
        let mut rng = ChaCha20Rng::from_seed(seed);
        seed.zeroize();
        let sharks = Sharks(threshold);
        let shares: Vec<Share> = sharks.dealer_rng(&secret, &mut rng).take(count.into()).collect();
        // rand_chacha does not implement Zeroize. Replacing the generator overwrites
        // its key/counter state before the stack frame is released.
        rng = ChaCha20Rng::from_seed([0; 32]);
        std::hint::black_box(&mut rng);
        let mut output = Vec::with_capacity(shares.len() * (secret.len() + 1));
        for share in &shares {
            output.extend_from_slice(&Vec::<u8>::from(share));
        }
        Ok(output)
    })();
    secret.zeroize();
    random_seed.zeroize();
    result
}

#[wasm_bindgen]
pub fn recover_shamir_secret(
    mut serialized: Vec<u8>,
    share_length: u8,
    threshold: u8,
) -> Result<Vec<u8>, JsValue> {
    let result = (|| {
        if threshold < 2 {
            return Err(JsValue::from_str("Shamir threshold must be at least 2."));
        }
        let share_length = usize::from(share_length);
        if !(MIN_SECRET_BYTES + 1..=MAX_SECRET_BYTES + 1).contains(&share_length)
            || serialized.is_empty()
            || serialized.len() % share_length != 0
        {
            return Err(JsValue::from_str("Shamir share bytes have an invalid length."));
        }
        if serialized.len() / share_length < usize::from(threshold) {
            return Err(JsValue::from_str("Not enough Shamir shares for the selected threshold."));
        }
        let shares: Result<Vec<Share>, _> = serialized.chunks_exact(share_length).map(Share::try_from).collect();
        let shares = shares.map_err(|_| JsValue::from_str("A Shamir share has an invalid serialization."))?;
        Sharks(threshold)
            .recover(&shares)
            .map_err(|_| JsValue::from_str("The Shamir shares could not reconstruct a secret."))
    })();
    serialized.zeroize();
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_all_bip39_entropy_sizes() {
        for length in [16usize, 20, 24, 28, 32] {
            let secret: Vec<u8> = (0..length).map(|index| (index * 13 + 7) as u8).collect();
            let packed = split_shamir_shares(secret.clone(), 3, 5, vec![42; 32]).unwrap();
            let share_length = length + 1;
            let selected = [
                &packed[0..share_length],
                &packed[share_length * 2..share_length * 3],
                &packed[share_length * 4..share_length * 5],
            ]
            .concat();
            assert_eq!(
                recover_shamir_secret(selected, share_length as u8, 3).unwrap(),
                secret
            );
        }
    }
}
