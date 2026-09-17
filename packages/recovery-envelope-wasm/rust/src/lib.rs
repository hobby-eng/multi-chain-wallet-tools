use bc_components::{
    KeyDerivationMethod, PrivateKeyBase, SSKRGroupSpec, SSKRSpec, SymmetricKey,
    X25519PrivateKey, X25519PublicKey,
};
use bc_envelope::prelude::{URDecodable, UREncodable};
use bc_envelope::{known_values, Envelope};
use dcbor::prelude::*;
use wasm_bindgen::prelude::*;
use zeroize::Zeroize;

fn message(error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&error.to_string())
}

fn validate_entropy(entropy: &[u8]) -> Result<(), JsValue> {
    if matches!(entropy.len(), 16 | 20 | 24 | 28 | 32) {
        Ok(())
    } else {
        Err(JsValue::from_str(
            "A Seed Envelope requires standard 128, 160, 192, 224, or 256-bit BIP39 entropy.",
        ))
    }
}

const BIP39_PASSPHRASE_PREDICATE: &str = "ckd-bip39-passphrase";

fn seed_envelope(data: &[u8], name: &str, note: &str, bip39_passphrase: Option<&str>) -> Envelope {
    let mut envelope =
        Envelope::new(CBOR::to_byte_string(data)).add_type(known_values::SEED_TYPE);
    if !name.trim().is_empty() {
        envelope = envelope.add_assertion(known_values::NAME, name.trim());
    }
    if !note.trim().is_empty() {
        envelope = envelope.add_assertion(known_values::NOTE, note.trim());
    }
    if let Some(passphrase) = bip39_passphrase {
        envelope = envelope.add_assertion(BIP39_PASSPHRASE_PREDICATE, passphrase);
    }
    envelope
}

fn extract_seed_entropy(envelope: &Envelope) -> Result<Vec<u8>, JsValue> {
    envelope
        .check_type_value(&known_values::SEED_TYPE)
        .map_err(message)?;
    let data = envelope
        .subject()
        .try_leaf()
        .map_err(message)?
        .try_into_byte_string()
        .map_err(message)?
        .to_vec();
    validate_entropy(&data)?;
    Ok(data)
}

#[wasm_bindgen]
pub fn create_seed_envelope(
    mut entropy: Vec<u8>,
    name: String,
    note: String,
    mut password: String,
) -> Result<String, JsValue> {
    bc_envelope::register_tags();
    let result = (|| {
        validate_entropy(&entropy)?;
        let envelope = seed_envelope(&entropy, &name, &note, None);
        let envelope = if password.is_empty() {
            envelope
        } else {
            envelope
                .lock(KeyDerivationMethod::Argon2id, password.as_bytes())
                .map_err(message)?
        };
        Ok(envelope.ur_string())
    })();
    entropy.zeroize();
    password.zeroize();
    result
}

#[wasm_bindgen]
pub fn recover_seed_envelope(
    mut record: String,
    mut password: String,
) -> Result<Vec<u8>, JsValue> {
    bc_envelope::register_tags();
    let result = (|| {
        let envelope = Envelope::from_ur_string(record.trim()).map_err(message)?;
        let envelope = if envelope.is_locked_with_password() {
            if password.is_empty() {
                return Err(JsValue::from_str("This Seed Envelope is password-locked."));
            }
            envelope.unlock(password.as_bytes()).map_err(message)?
        } else {
            envelope
        };
        extract_seed_entropy(&envelope)
    })();
    record.zeroize();
    password.zeroize();
    result
}

#[wasm_bindgen]
pub fn create_seed_envelope_advanced(
    mut entropy: Vec<u8>,
    name: String,
    note: String,
    mut password: String,
    mut bip39_passphrase: String,
    recipient_public_keys: String,
    group_threshold: u8,
    group_specs: Vec<u8>,
) -> Result<String, JsValue> {
    bc_envelope::register_tags();
    let result = (|| {
        validate_entropy(&entropy)?;
        let recipients = recipient_public_keys
            .lines()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| X25519PublicKey::from_ur_string(value).map_err(message))
            .collect::<Result<Vec<_>, _>>()?;
        let wants_sskr = !group_specs.is_empty();
        if !bip39_passphrase.is_empty() && password.is_empty() && recipients.is_empty() && !wants_sskr {
            return Err(JsValue::from_str(
                "Including the BIP39 passphrase requires password, recipient, or SSKR protection.",
            ));
        }
        if password.is_empty() && recipients.is_empty() && !wants_sskr {
            return Ok(seed_envelope(&entropy, &name, &note, None).ur_string());
        }

        let content_key = SymmetricKey::new();
        let included_passphrase = (!bip39_passphrase.is_empty()).then_some(bip39_passphrase.as_str());
        let mut protected = seed_envelope(&entropy, &name, &note, included_passphrase).encrypt(&content_key);
        if !password.is_empty() {
            protected = protected
                .add_secret(
                    KeyDerivationMethod::Argon2id,
                    password.as_bytes(),
                    &content_key,
                )
                .map_err(message)?;
        }
        for recipient in &recipients {
            protected = protected.add_recipient(recipient, &content_key);
        }

        let records = if wants_sskr {
            if group_specs.len() % 2 != 0 {
                return Err(JsValue::from_str(
                    "SSKR groups must contain threshold/count pairs.",
                ));
            }
            let groups = group_specs
                .chunks_exact(2)
                .map(|pair| {
                    SSKRGroupSpec::new(usize::from(pair[0]), usize::from(pair[1]))
                        .map_err(message)
                })
                .collect::<Result<Vec<_>, _>>()?;
            let spec =
                SSKRSpec::new(usize::from(group_threshold), groups).map_err(message)?;
            protected
                .sskr_split_flattened(&spec, &content_key)
                .map_err(message)?
        } else {
            vec![protected]
        };
        Ok(records
            .into_iter()
            .map(|record| record.ur_string())
            .collect::<Vec<_>>()
            .join("\n"))
    })();
    entropy.zeroize();
    password.zeroize();
    bip39_passphrase.zeroize();
    result
}

fn open_seed_envelope_advanced(
    records: &str,
    password: &str,
    recipient_private_key: &str,
) -> Result<Envelope, JsValue> {
    let envelopes = records
        .lines()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| Envelope::from_ur_string(value).map_err(message))
        .collect::<Result<Vec<_>, _>>()?;
    if envelopes.is_empty() {
        return Err(JsValue::from_str("Enter a Gordian Envelope."));
    }
    if !recipient_private_key.is_empty() {
        let key = X25519PrivateKey::from_ur_string(recipient_private_key.trim()).map_err(message)?;
        envelopes[0].decrypt_to_recipient(&key).map_err(message)
    } else if !password.is_empty() {
        envelopes[0].unlock(password.as_bytes()).map_err(message)
    } else {
        match Envelope::sskr_join(&envelopes.iter().collect::<Vec<_>>()) {
            Ok(joined) => joined.try_unwrap().map_err(message),
            Err(_) if envelopes.len() == 1 => Ok(envelopes[0].clone()),
            Err(error) => Err(message(error)),
        }
    }
}

#[wasm_bindgen]
pub fn recover_seed_envelope_advanced(
    mut records: String,
    mut password: String,
    mut recipient_private_key: String,
) -> Result<Vec<u8>, JsValue> {
    bc_envelope::register_tags();
    let result = (|| {
        let opened = open_seed_envelope_advanced(&records, &password, &recipient_private_key)?;
        extract_seed_entropy(&opened)
    })();
    records.zeroize();
    password.zeroize();
    recipient_private_key.zeroize();
    result
}

#[wasm_bindgen]
pub fn recover_seed_envelope_bundle_advanced(
    mut records: String,
    mut password: String,
    mut recipient_private_key: String,
) -> Result<String, JsValue> {
    bc_envelope::register_tags();
    let result = (|| {
        let opened = open_seed_envelope_advanced(&records, &password, &recipient_private_key)?;
        let mut entropy = extract_seed_entropy(&opened)?;
        let mut passphrase = opened
            .extract_object_for_predicate::<String>(BIP39_PASSPHRASE_PREDICATE)
            .ok();
        let encoded = serde_json::to_string(&serde_json::json!({
            "entropy": entropy,
            "bip39Passphrase": passphrase,
        }))
        .map_err(message);
        entropy.zeroize();
        passphrase.zeroize();
        encoded
    })();
    records.zeroize();
    password.zeroize();
    recipient_private_key.zeroize();
    result
}

#[wasm_bindgen]
pub fn derive_seed_recipient_keys(mut bip39_seed: Vec<u8>) -> Result<String, JsValue> {
    bc_envelope::register_tags();
    let result = (|| {
        if bip39_seed.len() != 64 {
            return Err(JsValue::from_str(
                "Recipient derivation requires the 64-byte BIP39 seed.",
            ));
        }
        // PrivateKeyBase applies the standard Blockchain Commons domain-separated
        // X25519 derivation. This intentionally includes the BIP39 passphrase
        // because the caller supplies the complete 64-byte BIP39 seed.
        let key_base = PrivateKeyBase::from_data(&bip39_seed);
        let private_key = key_base.x25519_private_key();
        let public_key = private_key.public_key();
        Ok(format!(
            r#"{{"privateKey":"{}","publicKey":"{}"}}"#,
            private_key.ur_string(),
            public_key.ur_string(),
        ))
    })();
    bip39_seed.zeroize();
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Vec<u8> {
        vec![0x23; 16]
    }

    #[test]
    fn unencrypted_round_trip() {
        let entropy = sample();
        let envelope = create_seed_envelope(
            entropy.clone(),
            "Test".into(),
            "Offline".into(),
            String::new(),
        )
        .unwrap();
        assert!(envelope.starts_with("ur:envelope/"));
        assert_eq!(
            recover_seed_envelope(envelope, String::new()).unwrap(),
            entropy,
        );
    }

    #[test]
    fn password_permit_round_trip() {
        let entropy = sample();
        let records = create_seed_envelope_advanced(
            entropy.clone(),
            String::new(),
            String::new(),
            "correct horse".into(),
            String::new(),
            String::new(),
            0,
            vec![],
        )
        .unwrap();
        assert_eq!(
            recover_seed_envelope_advanced(
                records,
                "correct horse".into(),
                String::new(),
            )
            .unwrap(),
            entropy,
        );
    }

    #[test]
    fn recipient_permit_round_trip() {
        let entropy = sample();
        let keys: serde_json::Value =
            serde_json::from_str(&derive_seed_recipient_keys(vec![7; 64]).unwrap()).unwrap();
        let private_key = keys["privateKey"].as_str().unwrap();
        let public_key = keys["publicKey"].as_str().unwrap();
        let records = create_seed_envelope_advanced(
            entropy.clone(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            public_key.into(),
            0,
            vec![],
        )
        .unwrap();
        assert_eq!(
            recover_seed_envelope_advanced(
                records,
                String::new(),
                private_key.into(),
            )
            .unwrap(),
            entropy,
        );
    }

    #[test]
    fn encrypted_bip39_passphrase_round_trip() {
        let entropy = sample();
        let records = create_seed_envelope_advanced(
            entropy.clone(),
            String::new(),
            String::new(),
            "container password".into(),
            "wallet passphrase".into(),
            String::new(),
            0,
            vec![],
        )
        .unwrap();
        let bundle: serde_json::Value = serde_json::from_str(
            &recover_seed_envelope_bundle_advanced(
                records,
                "container password".into(),
                String::new(),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(bundle["bip39Passphrase"], "wallet passphrase");
        assert_eq!(bundle["entropy"].as_array().unwrap().len(), entropy.len());
    }

    #[test]
    fn sskr_permit_round_trip() {
        let entropy = sample();
        let records = create_seed_envelope_advanced(
            entropy.clone(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            1,
            vec![2, 3],
        )
        .unwrap();
        let shares: Vec<_> = records.lines().collect();
        assert_eq!(shares.len(), 3);
        assert_eq!(
            recover_seed_envelope_advanced(
                [shares[0], shares[2]].join("\n"),
                String::new(),
                String::new(),
            )
            .unwrap(),
            entropy,
        );
    }
}
