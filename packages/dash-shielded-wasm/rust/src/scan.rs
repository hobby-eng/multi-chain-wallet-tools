//! Viewing-key-only Dash Orchard note scanner.
//!
//! This module is deliberately separate from ZIP-32 derivation. It accepts an
//! already-derived raw FullViewingKey and the fixed-width fields returned by
//! Dash Platform's `getShieldedEncryptedNotes` query. It never accepts or
//! reconstructs spending authority.

use orchard::{
    keys::{
        FullViewingKey, IncomingViewingKey, OutgoingViewingKey, PreparedIncomingViewingKey, Scope,
    },
    memo::{DashMemo, COMPACT_NOTE_SIZE},
    note::{ExtractedNoteCommitment, Nullifier},
    note_encryption::OrchardDomain,
    value::ValueCommitment,
    zcash_note_encryption::{
        note_bytes::{NoteBytes, NoteBytesData},
        try_note_decryption, try_output_recovery_with_ovk, EphemeralKeyBytes, ShieldedOutput,
    },
    Address, Note,
};
use serde::Serialize;
use wasm_bindgen::prelude::*;

const FIELD_SIZE: usize = 32;
const FULL_VIEWING_KEY_SIZE: usize = 96;
const INCOMING_VIEWING_KEY_SIZE: usize = 64;
const OUTGOING_VIEWING_KEY_SIZE: usize = 32;
const ENC_CIPHERTEXT_SIZE: usize = 104;
const OUT_CIPHERTEXT_SIZE: usize = 80;
const ENCRYPTED_NOTE_SIZE: usize = FIELD_SIZE + ENC_CIPHERTEXT_SIZE + OUT_CIPHERTEXT_SIZE;
const MAX_SCAN_BATCH: usize = 8192;

struct RecoverableOutput {
    cmx: ExtractedNoteCommitment,
    epk: EphemeralKeyBytes,
    enc: NoteBytesData<ENC_CIPHERTEXT_SIZE>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecoveredNote {
    value: String,
    address_raw: String,
    memo: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    note_nullifier: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanItem {
    position: String,
    cmx: String,
    action_nullifier: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    incoming: Option<RecoveredNote>,
    #[serde(skip_serializing_if = "Option::is_none")]
    outgoing: Option<RecoveredNote>,
}

#[derive(Serialize)]
struct ScanResult {
    items: Vec<ScanItem>,
}

impl ShieldedOutput<OrchardDomain<DashMemo>> for RecoverableOutput {
    fn ephemeral_key(&self) -> EphemeralKeyBytes {
        EphemeralKeyBytes(self.epk.0)
    }

    fn cmstar(&self) -> &ExtractedNoteCommitment {
        &self.cmx
    }

    fn enc_ciphertext(&self) -> Option<&NoteBytesData<ENC_CIPHERTEXT_SIZE>> {
        Some(&self.enc)
    }

    fn enc_ciphertext_compact(&self) -> NoteBytesData<COMPACT_NOTE_SIZE> {
        NoteBytesData::<COMPACT_NOTE_SIZE>::from_slice(&self.enc.as_ref()[..COMPACT_NOTE_SIZE])
            .expect("the full ciphertext is always longer than its compact prefix")
    }
}

fn validate_batch_lengths(
    cmx: &[u8],
    nullifiers: &[u8],
    cv_net: &[u8],
    encrypted_notes: &[u8],
) -> Result<usize, String> {
    if cmx.is_empty() || cmx.len() % FIELD_SIZE != 0 {
        return Err("cmx batch must contain one or more complete 32-byte fields".to_owned());
    }
    let count = cmx.len() / FIELD_SIZE;
    if count > MAX_SCAN_BATCH {
        return Err(format!(
            "shielded scan batch exceeds {MAX_SCAN_BATCH} notes"
        ));
    }
    if nullifiers.len() != count * FIELD_SIZE {
        return Err("nullifier batch length does not match cmx batch length".to_owned());
    }
    if cv_net.len() != count * FIELD_SIZE {
        return Err("cv_net batch length does not match cmx batch length".to_owned());
    }
    if encrypted_notes.len() != count * ENCRYPTED_NOTE_SIZE {
        return Err("encrypted-note batch must contain exactly 216 bytes per note".to_owned());
    }
    Ok(count)
}

fn parse_full_viewing_key(full_viewing_key: &[u8]) -> Result<FullViewingKey, String> {
    let fvk_bytes: [u8; FULL_VIEWING_KEY_SIZE] = full_viewing_key
        .try_into()
        .map_err(|_| "raw Orchard full viewing key must contain exactly 96 bytes".to_owned())?;
    FullViewingKey::from_bytes(&fvk_bytes)
        .ok_or_else(|| "raw Orchard full viewing key is not a canonical encoding".to_owned())
}

fn parse_incoming_viewing_key(incoming_viewing_key: &[u8]) -> Result<IncomingViewingKey, String> {
    let ivk_bytes: [u8; INCOMING_VIEWING_KEY_SIZE] = incoming_viewing_key
        .try_into()
        .map_err(|_| "raw Orchard incoming viewing key must contain exactly 64 bytes".to_owned())?;
    Option::from(IncomingViewingKey::from_bytes(&ivk_bytes))
        .ok_or_else(|| "raw Orchard incoming viewing key is not a canonical encoding".to_owned())
}

fn parse_outgoing_viewing_key(outgoing_viewing_key: &[u8]) -> Result<OutgoingViewingKey, String> {
    let ovk_bytes: [u8; OUTGOING_VIEWING_KEY_SIZE] = outgoing_viewing_key
        .try_into()
        .map_err(|_| "raw Orchard outgoing viewing key must contain exactly 32 bytes".to_owned())?;
    Ok(OutgoingViewingKey::from(ovk_bytes))
}

fn parsed_output(
    cmx: &[u8],
    nullifier: &[u8],
    cv_net: &[u8],
    encrypted_note: &[u8],
) -> Option<(
    Nullifier,
    ValueCommitment,
    RecoverableOutput,
    [u8; OUT_CIPHERTEXT_SIZE],
)> {
    let nf = Nullifier::from_bytes(nullifier.try_into().ok()?).into_option()?;
    let cmx = ExtractedNoteCommitment::from_bytes(cmx.try_into().ok()?).into_option()?;
    let cv = ValueCommitment::from_bytes(cv_net.try_into().ok()?).into_option()?;
    let epk = EphemeralKeyBytes(encrypted_note[..FIELD_SIZE].try_into().ok()?);
    let enc = NoteBytesData::<ENC_CIPHERTEXT_SIZE>(
        encrypted_note[FIELD_SIZE..FIELD_SIZE + ENC_CIPHERTEXT_SIZE]
            .try_into()
            .ok()?,
    );
    let out = encrypted_note[FIELD_SIZE + ENC_CIPHERTEXT_SIZE..]
        .try_into()
        .ok()?;
    Some((nf, cv, RecoverableOutput { cmx, epk, enc }, out))
}

fn recovered_note(
    note: &Note,
    address: &Address,
    memo: &[u8; 36],
    note_nullifier: Option<&[u8; 32]>,
) -> RecoveredNote {
    // Dash Platform puts credit amounts directly into Orchard NoteValue. The
    // JS presentation layer converts 100,000,000,000 credits to one DASH.
    RecoveredNote {
        value: note.value().inner().to_string(),
        address_raw: hex::encode(address.to_raw_address_bytes()),
        memo: hex::encode(memo),
        note_nullifier: note_nullifier.map(hex::encode),
    }
}

fn scan_prepared_batch_json(
    prepared_ivk: Option<&PreparedIncomingViewingKey>,
    full_viewing_key: Option<&FullViewingKey>,
    outgoing_viewing_key: Option<&OutgoingViewingKey>,
    start_position: u64,
    cmx: &[u8],
    nullifiers: &[u8],
    cv_net: &[u8],
    encrypted_notes: &[u8],
) -> Result<String, String> {
    let count = validate_batch_lengths(cmx, nullifiers, cv_net, encrypted_notes)?;
    start_position
        .checked_add(count as u64 - 1)
        .ok_or_else(|| "shielded note position range overflows uint64".to_owned())?;

    let mut items = Vec::new();

    for index in 0..count {
        let field_start = index * FIELD_SIZE;
        let note_start = index * ENCRYPTED_NOTE_SIZE;
        let wire_cmx = &cmx[field_start..field_start + FIELD_SIZE];
        let wire_nullifier = &nullifiers[field_start..field_start + FIELD_SIZE];
        let Some((nf, cv, output, out_ciphertext)) = parsed_output(
            wire_cmx,
            wire_nullifier,
            &cv_net[field_start..field_start + FIELD_SIZE],
            &encrypted_notes[note_start..note_start + ENCRYPTED_NOTE_SIZE],
        ) else {
            continue;
        };
        let domain = OrchardDomain::<DashMemo>::for_nullifier(nf);
        let incoming = prepared_ivk.and_then(|ivk| try_note_decryption(&domain, ivk, &output));
        let outgoing = outgoing_viewing_key.and_then(|ovk| {
            try_output_recovery_with_ovk(&domain, ovk, &output, &cv, &out_ciphertext)
        });
        if incoming.is_none() && outgoing.is_none() {
            continue;
        }

        let position = start_position + index as u64;
        let incoming = incoming.map(|(note, address, memo)| {
            let note_nullifier = full_viewing_key.map(|fvk| note.nullifier(fvk).to_bytes());
            recovered_note(&note, &address, &memo, note_nullifier.as_ref())
        });
        let outgoing =
            outgoing.map(|(note, address, memo)| recovered_note(&note, &address, &memo, None));
        items.push(ScanItem {
            position: position.to_string(),
            cmx: hex::encode(wire_cmx),
            action_nullifier: hex::encode(wire_nullifier),
            incoming,
            outgoing,
        });
    }
    serde_json::to_string(&ScanResult { items })
        .map_err(|cause| format!("failed to serialize Orchard scan: {cause}"))
}

fn scan_full_batch_json(
    full_viewing_key: &[u8],
    start_position: u64,
    cmx: &[u8],
    nullifiers: &[u8],
    cv_net: &[u8],
    encrypted_notes: &[u8],
) -> Result<String, String> {
    let fvk = parse_full_viewing_key(full_viewing_key)?;
    let prepared_ivk = fvk.to_ivk(Scope::External).prepare();
    let ovk = fvk.to_ovk(Scope::External);
    scan_prepared_batch_json(
        Some(&prepared_ivk),
        Some(&fvk),
        Some(&ovk),
        start_position,
        cmx,
        nullifiers,
        cv_net,
        encrypted_notes,
    )
}

fn scan_incoming_batch_json(
    incoming_viewing_key: &[u8],
    start_position: u64,
    cmx: &[u8],
    nullifiers: &[u8],
    cv_net: &[u8],
    encrypted_notes: &[u8],
) -> Result<String, String> {
    let ivk = parse_incoming_viewing_key(incoming_viewing_key)?;
    scan_prepared_batch_json(
        Some(&ivk.prepare()),
        None,
        None,
        start_position,
        cmx,
        nullifiers,
        cv_net,
        encrypted_notes,
    )
}

fn scan_outgoing_batch_json(
    outgoing_viewing_key: &[u8],
    start_position: u64,
    cmx: &[u8],
    nullifiers: &[u8],
    cv_net: &[u8],
    encrypted_notes: &[u8],
) -> Result<String, String> {
    let ovk = parse_outgoing_viewing_key(outgoing_viewing_key)?;
    scan_prepared_batch_json(
        None,
        None,
        Some(&ovk),
        start_position,
        cmx,
        nullifiers,
        cv_net,
        encrypted_notes,
    )
}

/// Validates the canonical raw FullViewingKey encoding without network access.
/// The caller's byte buffer is overwritten before return on success or error.
#[wasm_bindgen]
pub fn validate_full_viewing_key(full_viewing_key: &mut [u8]) -> Result<(), JsValue> {
    let result = parse_full_viewing_key(full_viewing_key).map(|_| ());
    full_viewing_key.fill(0);
    result.map_err(|message| JsValue::from_str(&message))
}

/// Validates the canonical raw IncomingViewingKey encoding without network access.
/// The caller's byte buffer is overwritten before return on success or error.
#[wasm_bindgen]
pub fn validate_incoming_viewing_key(incoming_viewing_key: &mut [u8]) -> Result<(), JsValue> {
    let result = parse_incoming_viewing_key(incoming_viewing_key).map(|_| ());
    incoming_viewing_key.fill(0);
    result.map_err(|message| JsValue::from_str(&message))
}

/// Validates the fixed-width raw OutgoingViewingKey encoding.
/// Every 32-byte value is a valid OVK; the caller's buffer is still overwritten.
#[wasm_bindgen]
pub fn validate_outgoing_viewing_key(outgoing_viewing_key: &mut [u8]) -> Result<(), JsValue> {
    let result = parse_outgoing_viewing_key(outgoing_viewing_key).map(|_| ());
    outgoing_viewing_key.fill(0);
    result.map_err(|message| JsValue::from_str(&message))
}

/// Trial-decrypts one fixed-width page returned by Dash Platform DAPI.
///
/// `full_viewing_key` is overwritten before this function returns, including
/// on validation errors. The returned JSON contains only matched incoming or
/// outgoing notes; it never contains spending authority.
#[wasm_bindgen]
pub fn scan_shielded_batch_json(
    full_viewing_key: &mut [u8],
    start_position: u64,
    cmx: &[u8],
    nullifiers: &[u8],
    cv_net: &[u8],
    encrypted_notes: &[u8],
) -> Result<String, JsValue> {
    let result = scan_full_batch_json(
        full_viewing_key,
        start_position,
        cmx,
        nullifiers,
        cv_net,
        encrypted_notes,
    );
    full_viewing_key.fill(0);
    result.map_err(|message| JsValue::from_str(&message))
}

/// Trial-decrypts incoming notes with a 64-byte raw IncomingViewingKey.
///
/// This deliberately omits outgoing recovery and note-nullifier derivation,
/// which are cryptographically unavailable without the FullViewingKey.
/// `incoming_viewing_key` is overwritten before return on success or error.
#[wasm_bindgen]
pub fn scan_shielded_incoming_batch_json(
    incoming_viewing_key: &mut [u8],
    start_position: u64,
    cmx: &[u8],
    nullifiers: &[u8],
    cv_net: &[u8],
    encrypted_notes: &[u8],
) -> Result<String, JsValue> {
    let result = scan_incoming_batch_json(
        incoming_viewing_key,
        start_position,
        cmx,
        nullifiers,
        cv_net,
        encrypted_notes,
    );
    incoming_viewing_key.fill(0);
    result.map_err(|message| JsValue::from_str(&message))
}

/// Recovers outgoing notes with a 32-byte raw OutgoingViewingKey.
///
/// This deliberately omits incoming recovery, balance, and spent detection.
/// `outgoing_viewing_key` is overwritten before return on success or error.
#[wasm_bindgen]
pub fn scan_shielded_outgoing_batch_json(
    outgoing_viewing_key: &mut [u8],
    start_position: u64,
    cmx: &[u8],
    nullifiers: &[u8],
    cv_net: &[u8],
    encrypted_notes: &[u8],
) -> Result<String, JsValue> {
    let result = scan_outgoing_batch_json(
        outgoing_viewing_key,
        start_position,
        cmx,
        nullifiers,
        cv_net,
        encrypted_notes,
    );
    outgoing_viewing_key.fill(0);
    result.map_err(|message| JsValue::from_str(&message))
}

#[cfg(test)]
mod tests {
    use super::*;
    use orchard::{
        keys::SpendingKey,
        note::{RandomSeed, Rho},
        note_encryption::OrchardNoteEncryption,
        value::{NoteValue, ValueCommitTrapdoor},
        zcash_note_encryption::Domain,
    };
    use rand_core::OsRng;
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct OfficialPlatformWalletFixture {
        position: u64,
        recipient_full_viewing_key: String,
        sender_outgoing_viewing_key: String,
        cmx: String,
        action_nullifier: String,
        cv_net: String,
        encrypted_note: String,
        expected: OfficialPlatformWalletExpected,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct OfficialPlatformWalletExpected {
        value: String,
        address_raw: String,
        memo: String,
    }

    fn fixture_bytes(value: &str, expected_len: usize) -> Vec<u8> {
        let bytes = hex::decode(value).expect("fixture field must be hexadecimal");
        assert_eq!(bytes.len(), expected_len, "fixture field width changed");
        bytes
    }

    fn own_note_fixture() -> (FullViewingKey, Vec<u8>, Vec<u8>, Vec<u8>, Vec<u8>) {
        let spending_key = Option::<SpendingKey>::from(SpendingKey::from_bytes([0x0d; 32]))
            .expect("fixed spending key is canonical");
        let fvk = FullViewingKey::from(&spending_key);
        let recipient = fvk.address_at(7u32, Scope::External);
        let nf = Option::<Nullifier>::from(Nullifier::from_bytes(&[0x01; 32]))
            .expect("fixed nullifier is canonical");
        let rho =
            Option::<Rho>::from(Rho::from_bytes(&[0x01; 32])).expect("fixed rho is canonical");
        let rseed = Option::<RandomSeed>::from(RandomSeed::from_bytes([0x02; 32], &rho))
            .expect("fixed random seed is canonical");
        // Fixed cross-layer unit vector: 123_456_789_012 Platform credits are
        // rendered by the JS recovery layer as exactly 1.23456789012 DASH.
        let value = NoteValue::from_raw(123_456_789_012);
        let note = Option::<Note>::from(Note::from_parts(recipient, value, rho, rseed))
            .expect("fixed note is canonical");
        let cmx = ExtractedNoteCommitment::from(note.commitment());
        let rcv = Option::<ValueCommitTrapdoor>::from(ValueCommitTrapdoor::from_bytes([0x03; 32]))
            .expect("fixed value trapdoor is canonical");
        let cv = ValueCommitment::derive(value - NoteValue::from_raw(0), rcv);
        let mut memo = [0u8; 36];
        memo[..4].copy_from_slice(&1u32.to_le_bytes());
        memo[4..15].copy_from_slice(b"viewer test");
        let encryption =
            OrchardNoteEncryption::<DashMemo>::new(Some(fvk.to_ovk(Scope::External)), note, memo);
        let epk = OrchardDomain::<DashMemo>::epk_bytes(encryption.epk());
        let enc = encryption.encrypt_note_plaintext();
        let out = encryption.encrypt_outgoing_plaintext(&cv, &cmx, &mut OsRng);
        let mut encrypted_note = Vec::with_capacity(ENCRYPTED_NOTE_SIZE);
        encrypted_note.extend_from_slice(&epk.0);
        encrypted_note.extend_from_slice(enc.as_ref());
        encrypted_note.extend_from_slice(&out);
        (
            fvk,
            cmx.to_bytes().to_vec(),
            nf.to_bytes().to_vec(),
            cv.to_bytes().to_vec(),
            encrypted_note,
        )
    }

    #[test]
    fn official_platform_wallet_fixture_recovers_incoming_and_outgoing_note() {
        let fixture: OfficialPlatformWalletFixture = serde_json::from_str(include_str!(
            "../fixtures/official-platform-wallet-note.json"
        ))
        .expect("official Platform wallet fixture must be valid JSON");
        let fvk = fixture_bytes(&fixture.recipient_full_viewing_key, FULL_VIEWING_KEY_SIZE);
        let ovk = fixture_bytes(
            &fixture.sender_outgoing_viewing_key,
            OUTGOING_VIEWING_KEY_SIZE,
        );
        let cmx = fixture_bytes(&fixture.cmx, FIELD_SIZE);
        let action_nullifier = fixture_bytes(&fixture.action_nullifier, FIELD_SIZE);
        let cv_net = fixture_bytes(&fixture.cv_net, FIELD_SIZE);
        let encrypted_note = fixture_bytes(&fixture.encrypted_note, ENCRYPTED_NOTE_SIZE);

        let full: serde_json::Value = serde_json::from_str(
            &scan_full_batch_json(
                &fvk,
                fixture.position,
                &cmx,
                &action_nullifier,
                &cv_net,
                &encrypted_note,
            )
            .expect("recipient FVK must recover the official wallet action"),
        )
        .unwrap();
        let item = &full["items"][0];
        assert_eq!(item["position"], fixture.position.to_string());
        assert_eq!(item["cmx"], fixture.cmx);
        assert_eq!(item["actionNullifier"], fixture.action_nullifier);
        for capability in ["incoming", "outgoing"] {
            assert_eq!(item[capability]["value"], fixture.expected.value);
            assert_eq!(item[capability]["addressRaw"], fixture.expected.address_raw);
            assert_eq!(item[capability]["memo"], fixture.expected.memo);
        }
        assert_eq!(
            item["incoming"]["noteNullifier"]
                .as_str()
                .expect("FVK recovery must derive the owned-note nullifier")
                .len(),
            FIELD_SIZE * 2
        );

        let outgoing: serde_json::Value = serde_json::from_str(
            &scan_outgoing_batch_json(
                &ovk,
                fixture.position,
                &cmx,
                &action_nullifier,
                &cv_net,
                &encrypted_note,
            )
            .expect("sender OVK must recover the official wallet action"),
        )
        .unwrap();
        assert!(outgoing["items"][0].get("incoming").is_none());
        assert_eq!(
            outgoing["items"][0]["outgoing"]["addressRaw"],
            fixture.expected.address_raw
        );
    }

    #[test]
    fn full_viewing_key_recovers_incoming_and_outgoing_note() {
        let (fvk, cmx, nf, cv, encrypted) = own_note_fixture();
        let json = scan_full_batch_json(&fvk.to_bytes(), 42, &cmx, &nf, &cv, &encrypted).unwrap();
        assert!(json.contains("\"position\":\"42\""));
        assert!(json.contains("\"incoming\""));
        assert!(json.contains("\"outgoing\""));
        assert!(json.contains("\"value\":\"123456789012\""));
        assert!(json.contains("010000007669657765722074657374"));
        assert!(json.contains("\"noteNullifier\":"));
    }

    #[test]
    fn incoming_viewing_key_recovers_only_incoming_capability() {
        let (fvk, cmx, nf, cv, encrypted) = own_note_fixture();
        let ivk = fvk.to_ivk(Scope::External);
        let json =
            scan_incoming_batch_json(&ivk.to_bytes(), 42, &cmx, &nf, &cv, &encrypted).unwrap();
        assert!(json.contains("\"position\":\"42\""));
        assert!(json.contains("\"incoming\""));
        assert!(json.contains("\"value\":\"123456789012\""));
        assert!(!json.contains("\"outgoing\""));
        assert!(!json.contains("\"noteNullifier\""));
    }

    #[test]
    fn outgoing_viewing_key_recovers_only_outgoing_capability() {
        let (fvk, cmx, nf, cv, encrypted) = own_note_fixture();
        let ovk = fvk.to_ovk(Scope::External);
        let json = scan_outgoing_batch_json(ovk.as_ref(), 42, &cmx, &nf, &cv, &encrypted).unwrap();
        assert!(json.contains("\"position\":\"42\""));
        assert!(json.contains("\"outgoing\""));
        assert!(json.contains("\"value\":\"123456789012\""));
        assert!(!json.contains("\"incoming\""));
        assert!(!json.contains("\"noteNullifier\""));
    }

    #[test]
    fn foreign_viewing_key_recovers_nothing() {
        let (_, cmx, nf, cv, encrypted) = own_note_fixture();
        let other_sk = Option::<SpendingKey>::from(SpendingKey::from_bytes([0x11; 32])).unwrap();
        let other_fvk = FullViewingKey::from(&other_sk);
        let json =
            scan_full_batch_json(&other_fvk.to_bytes(), 0, &cmx, &nf, &cv, &encrypted).unwrap();
        assert_eq!(json, "{\"items\":[]}");
        let json = scan_incoming_batch_json(
            &other_fvk.to_ivk(Scope::External).to_bytes(),
            0,
            &cmx,
            &nf,
            &cv,
            &encrypted,
        )
        .unwrap();
        assert_eq!(json, "{\"items\":[]}");
    }

    #[test]
    fn scanner_rejects_wrong_key_and_batch_lengths() {
        let (_, cmx, nf, cv, encrypted) = own_note_fixture();
        assert!(scan_full_batch_json(&[0u8; 95], 0, &cmx, &nf, &cv, &encrypted).is_err());
        assert!(scan_full_batch_json(&[0u8; 96], 0, &cmx, &nf, &cv, &encrypted).is_err());
        assert!(scan_incoming_batch_json(&[0u8; 63], 0, &cmx, &nf, &cv, &encrypted).is_err());
        assert!(scan_incoming_batch_json(&[0u8; 64], 0, &cmx, &nf, &cv, &encrypted).is_err());
        assert!(scan_outgoing_batch_json(&[0u8; 31], 0, &cmx, &nf, &cv, &encrypted).is_err());
        assert!(scan_outgoing_batch_json(&[0u8; 32], 0, &cmx, &nf, &cv, &encrypted).is_ok());
        let (fvk, _, _, _, _) = own_note_fixture();
        assert!(
            scan_full_batch_json(&fvk.to_bytes(), 0, &cmx, &nf[..31], &cv, &encrypted).is_err()
        );
        assert!(scan_full_batch_json(
            &fvk.to_bytes(),
            u64::MAX,
            &[0u8; 64],
            &[0u8; 64],
            &[0u8; 64],
            &[0u8; ENCRYPTED_NOTE_SIZE * 2]
        )
        .is_err());
    }

    #[test]
    fn full_viewing_key_validation_accepts_only_canonical_encoding() {
        let (fvk, _, _, _, _) = own_note_fixture();
        assert!(parse_full_viewing_key(&fvk.to_bytes()).is_ok());
        assert!(parse_full_viewing_key(&[0u8; 96]).is_err());
        assert!(parse_full_viewing_key(&[0u8; 95]).is_err());
        let ivk = fvk.to_ivk(Scope::External);
        assert!(parse_incoming_viewing_key(&ivk.to_bytes()).is_ok());
        assert!(parse_incoming_viewing_key(&[0u8; 64]).is_err());
        assert!(parse_incoming_viewing_key(&[0u8; 63]).is_err());
        assert!(parse_outgoing_viewing_key(&[0u8; 32]).is_ok());
        assert!(parse_outgoing_viewing_key(&[0u8; 31]).is_err());
    }
}
