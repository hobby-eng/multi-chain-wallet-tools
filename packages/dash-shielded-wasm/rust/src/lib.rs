//! Narrow JS/WASM adapter for Dash's official Orchard fork.
//!
//! This crate deliberately contains no Orchard, ZIP-32, Pallas/Vesta, or
//! RedPallas implementation. It validates the browser boundary, calls the
//! official Dash-pinned `orchard` APIs, and serializes their canonical raw
//! key/address encodings for the TypeScript presentation layer.

use orchard::keys::{FullViewingKey, Scope, SpendingKey};
use serde::Serialize;
use wasm_bindgen::prelude::*;
use zip32::AccountId;

mod scan;

const DASH_MAINNET_COIN_TYPE: u32 = 5;
const DASH_TESTNET_COIN_TYPE: u32 = 1;
const MAX_RESULTS: u32 = 50;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DerivedAddress {
    index: u32,
    raw_address: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DerivationResult {
    spending_key: String,
    full_viewing_key: String,
    incoming_viewing_key: String,
    outgoing_viewing_key: String,
    rows: Vec<DerivedAddress>,
}

fn error(message: impl AsRef<str>) -> JsValue {
    JsValue::from_str(message.as_ref())
}

fn derive_json(
    seed: &[u8],
    coin_type: u32,
    account: u32,
    start: u32,
    count: u32,
) -> Result<String, String> {
    if !(32..=252).contains(&seed.len()) {
        return Err(format!(
            "ZIP-32 seed must contain 32 to 252 bytes; received {}.",
            seed.len()
        ));
    }
    if coin_type != DASH_MAINNET_COIN_TYPE && coin_type != DASH_TESTNET_COIN_TYPE {
        return Err("Dash Shielded coin type must be 5 (mainnet) or 1 (testnet).".to_owned());
    }
    if count == 0 || count > MAX_RESULTS {
        return Err(format!("Result count must be between 1 and {MAX_RESULTS}."));
    }
    start
        .checked_add(count - 1)
        .ok_or_else(|| "The requested diversifier index range overflows uint32.".to_owned())?;

    let account_id = AccountId::try_from(account)
        .map_err(|_| format!("Account must be below 2^31; received {account}."))?;
    let spending_key = SpendingKey::from_zip32_seed(seed, coin_type, account_id)
        .map_err(|cause| format!("Official Dash Orchard ZIP-32 derivation failed: {cause}"))?;
    let full_viewing_key = FullViewingKey::from(&spending_key);
    let incoming_viewing_key = full_viewing_key.to_ivk(Scope::External);
    let outgoing_viewing_key = full_viewing_key.to_ovk(Scope::External);

    let mut rows = Vec::with_capacity(count as usize);

    for offset in 0..count {
        let index = start + offset;
        let raw_address = full_viewing_key
            .address_at(index, Scope::External)
            .to_raw_address_bytes();
        rows.push(DerivedAddress {
            index,
            raw_address: hex::encode(raw_address),
        });
    }

    serde_json::to_string(&DerivationResult {
        spending_key: hex::encode(spending_key.to_bytes()),
        full_viewing_key: hex::encode(full_viewing_key.to_bytes()),
        incoming_viewing_key: hex::encode(incoming_viewing_key.to_bytes()),
        outgoing_viewing_key: hex::encode(outgoing_viewing_key.as_ref()),
        rows,
    })
    .map_err(|cause| format!("failed to serialize Orchard derivation: {cause}"))
}

/// Derives one Dash Orchard account and a sequential address batch.
///
/// The returned JSON only contains official raw encodings. Dash-specific
/// Bech32m display encoding is applied and independently vector-tested in TS.
#[wasm_bindgen]
pub fn derive_shielded_json(
    seed: &mut [u8],
    coin_type: u32,
    account: u32,
    start: u32,
    count: u32,
) -> Result<String, JsValue> {
    let result = derive_json(seed, coin_type, account, start, count);
    seed.fill(0);
    result.map_err(error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bech32::{Bech32m, Hrp};

    #[test]
    fn official_dash_from_seed_pin_matches() {
        let output: serde_json::Value = serde_json::from_str(
            &derive_json(&[0x42; 64], DASH_TESTNET_COIN_TYPE, 0, 0, 1).unwrap(),
        )
        .unwrap();
        assert_eq!(
            output["incomingViewingKey"],
            "fae18cbcf032c37f646b0e3f211bda62dc79535f5276abbf274f46ba1d28d571946102f72db50fd672aadddc8346c513221c82e3fbc0c62058a2effb9669f228"
        );
        assert_eq!(output["rows"][0]["index"], 0);
        assert_eq!(
            output["rows"][0]["rawAddress"],
            "ee9f8174f92a3f035570ecbfe969aeb46f5e2f64ad69f78d34316c47ea38c2f0085b5788bebf478ce736a8"
        );
    }

    #[test]
    fn dash_bech32m_display_pin_matches_official_format() {
        let raw = hex::decode(
            "ee9f8174f92a3f035570ecbfe969aeb46f5e2f64ad69f78d34316c47ea38c2f0085b5788bebf478ce736a8",
        )
        .unwrap();
        let mut payload = Vec::with_capacity(44);
        payload.push(0x10);
        payload.extend(raw);
        let encoded = bech32::encode::<Bech32m>(Hrp::parse("tdash").unwrap(), &payload).unwrap();
        assert_eq!(
            encoded,
            "tdash1zrhflqt5ly4r7q64wrktl6tf466x7h30vjkknaudxsckc3l28rp0qzzm27yta0683nnnd2qum8gyq"
        );
    }

    #[test]
    fn official_orchard_key_component_vector_matches() {
        let spending_key = Option::<SpendingKey>::from(SpendingKey::from_bytes([
            0x5d, 0x7a, 0x8f, 0x73, 0x9a, 0x2d, 0x9e, 0x94, 0x5b, 0x0c, 0xe1, 0x52, 0xa8, 0x04,
            0x9e, 0x29, 0x4c, 0x4d, 0x6e, 0x66, 0xb1, 0x64, 0x93, 0x9d, 0xaf, 0xfa, 0x2e, 0xf6,
            0xee, 0x69, 0x21, 0x48,
        ]))
        .unwrap();
        let fvk = FullViewingKey::from(&spending_key);
        let address = fvk.address_at(0u32, Scope::External).to_raw_address_bytes();
        assert_eq!(
            hex::encode(fvk.to_ivk(Scope::External).to_bytes()),
            "31d6a685be570f9faf3ca8b052e887840b2c9f8d67224ca82aefb9e2ee5bedaf85c8b5cd1ac3ec3ad7092132f97f0178b075c81a139fd460bbe0dfcd75514724"
        );
        assert_eq!(
            hex::encode(fvk.to_ovk(Scope::External).as_ref()),
            "bcc7065e59910b35993f59505be209b14bf02488750bbc8b1acdcf108c362004"
        );
        assert_eq!(
            hex::encode(address),
            "8ff3386971cb64b8e7789908dd8ebd7de92a68e586a34db8fea999efd2016fae76750afae7ee941646bcb9"
        );
    }

    #[test]
    fn boundary_validation_and_domain_separation_hold() {
        assert!(derive_json(&[0; 16], 1, 0, 0, 1).is_err());
        assert!(derive_json(&[0; 64], 2, 0, 0, 1).is_err());
        assert!(derive_json(&[0; 64], 1, 1 << 31, 0, 1).is_err());
        assert!(derive_json(&[0; 64], 1, 0, u32::MAX, 2).is_err());
        let testnet = derive_json(&[0x42; 64], 1, 0, 0, 1).unwrap();
        let mainnet = derive_json(&[0x42; 64], 5, 0, 0, 1).unwrap();
        assert_ne!(testnet, mainnet);
    }
}
