//! Embeds the Key Derivation Tool page in the launcher.
//!
//! The HTML build passes the page and its SHA-256 in DERIVER_PAGE and DERIVER_PAGE_SHA256. The page
//! is embedded only if it has that SHA-256; the launcher checks it again when it starts. Without
//! DERIVER_PAGE, as in `cargo test`, a placeholder is embedded, and the program refuses to run; a
//! release build without DERIVER_PAGE fails.

use std::env;
use std::fmt::Write;
use std::fs;
use std::path::PathBuf;

use sha2::{Digest, Sha256};

/// Marks a launcher built without the page; main.rs refuses to serve it.
const PLACEHOLDER: &[u8] =
    b"<!-- no page: build the launcher with tooling/build-key-derivation-launchers.mjs -->";

fn main() {
    println!("cargo:rerun-if-env-changed=DERIVER_PAGE");
    println!("cargo:rerun-if-env-changed=DERIVER_PAGE_SHA256");
    let output = PathBuf::from(env::var("OUT_DIR").expect("Cargo sets OUT_DIR"));
    let (page, digest) = match env::var("DERIVER_PAGE") {
        Ok(path) => {
            println!("cargo:rerun-if-changed={path}");
            let page =
                fs::read(&path).unwrap_or_else(|error| panic!("cannot read {path}: {error}"));
            let expected = env::var("DERIVER_PAGE_SHA256")
                .expect("DERIVER_PAGE_SHA256 must give the SHA-256 of DERIVER_PAGE");
            let actual = sha256_hex(&page);
            assert_eq!(
                actual,
                expected.to_ascii_lowercase(),
                "{path} does not have the given SHA-256"
            );
            (page, actual)
        }
        // A release build must carry the real page: only test and debug builds get the placeholder.
        Err(_) if env::var("PROFILE").as_deref() == Ok("release") => {
            panic!("DERIVER_PAGE is not set; build release launchers with tooling/build-key-derivation-launchers.mjs")
        }
        Err(_) => (PLACEHOLDER.to_vec(), sha256_hex(PLACEHOLDER)),
    };
    fs::write(output.join("title.txt"), page_title(&page)).expect("write the page title");
    fs::write(output.join("page.html"), page).expect("write the embedded page");
    fs::write(output.join("page.sha256"), digest).expect("write the embedded SHA-256");
}

/// The text of the page's <title>, which names the edition; the launcher prints it first.
fn page_title(page: &[u8]) -> String {
    const FALLBACK: &str = "Key Derivation Tool";
    let text = String::from_utf8_lossy(page);
    let Some(start) = text.find("<title>") else {
        return FALLBACK.into();
    };
    let rest = &text[start + "<title>".len()..];
    match rest.find("</title>") {
        Some(end) if end > 0 => rest[..end].trim().to_string(),
        _ => FALLBACK.into(),
    }
}

/// SHA-256 as 64 lowercase hex digits, the form of the .sha256 files next to the page.
fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .fold(String::with_capacity(64), |mut text, byte| {
            let _ = write!(text, "{byte:02x}");
            text
        })
}
