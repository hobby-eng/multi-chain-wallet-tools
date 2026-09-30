//! The executable version of the Key Derivation Tool.
//!
//! A browser runs MHFE's four Argon2 lanes in parallel only on a cross-origin isolated page, and a
//! page opened as a file never is. This program carries the tool's page inside it, checks it
//! against the SHA-256 it was built with, and serves it to this computer only (127.0.0.1) with the
//! headers that make it isolated. It never receives a secret: all the work happens in the page.
//! It needs no installation and uses only the Rust standard library.

mod server;

use sha2::{Digest, Sha256};
use std::fmt::Write;
use std::io::{self, BufRead};
use std::net::{Ipv4Addr, SocketAddrV4, TcpListener};
use std::process::{Command, ExitCode};

/// The page and its SHA-256, embedded by build.rs.
const PAGE: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/page.html"));
const PAGE_SHA256: &str = include_str!(concat!(env!("OUT_DIR"), "/page.sha256"));
const PAGE_TITLE: &str = include_str!(concat!(env!("OUT_DIR"), "/title.txt"));
/// What build.rs embeds when it was not given the page.
const PLACEHOLDER_PREFIX: &[u8] = b"<!-- no page:";

fn main() -> ExitCode {
    println!("{PAGE_TITLE}");
    println!();
    let result = run();
    if let Err(message) = &result {
        eprintln!("Error: {message}");
    }
    // A double-click opens a window that closes when the program ends; keep it open until the
    // message has been read.
    println!();
    println!("Press Enter to close this window.");
    let _ = io::stdin().lock().read_line(&mut String::new());
    if result.is_ok() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

fn run() -> Result<(), String> {
    if PAGE.starts_with(PLACEHOLDER_PREFIX) {
        return Err("this launcher was built without the tool's page; nothing was served.".into());
    }
    let digest = sha256_hex(PAGE);
    if digest != PAGE_SHA256 {
        return Err(format!(
            "the embedded page has SHA-256 {digest}, but the program was built for {PAGE_SHA256}; \
             the file is damaged, so nothing was served."
        ));
    }
    println!("SHA-256 of the embedded page verified: {digest}");

    let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))
        .map_err(|error| format!("cannot open a local port: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("cannot read the local port: {error}"))?
        .port();
    let address = format!("http://127.0.0.1:{port}/");
    // --no-browser prints the address instead, for tests and for opening another browser.
    let no_browser = std::env::args()
        .skip(1)
        .any(|argument| argument == "--no-browser");
    if no_browser || open_browser(&address).is_err() {
        println!("Open {address} in your browser.");
    } else {
        println!("The tool opens in your browser at {address}.");
    }
    println!("It runs only on this computer and sees nothing you type into the page.");
    println!(
        "Keep this window open while you use the tool; close it or press Ctrl+C when you are done."
    );
    // Stopping the server does not reach a tab that already has the page: it keeps running and
    // keeps what was typed into it in memory until it is closed.
    println!("Closing this window does not close the page: close its browser tab as well.");
    server::serve(listener, format!("127.0.0.1:{port}"), PAGE);
    Ok(())
}

/// SHA-256 as 64 lowercase hex digits, the form build.rs embeds.
fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .fold(String::with_capacity(64), |mut text, byte| {
            let _ = write!(text, "{byte:02x}");
            text
        })
}

/// Opens the default browser; the address holds no secret.
fn open_browser(address: &str) -> io::Result<()> {
    let mut command = if cfg!(target_os = "macos") {
        Command::new("open")
    } else if cfg!(windows) {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", ""]);
        command
    } else {
        Command::new("xdg-open")
    };
    command.arg(address).spawn().map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::sha256_hex;

    /// Published SHA-256 test vectors (FIPS 180-4 examples and the empty string), which also pin
    /// the hex form that build.rs writes.
    #[test]
    fn sha256_hex_matches_known_vectors() {
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
