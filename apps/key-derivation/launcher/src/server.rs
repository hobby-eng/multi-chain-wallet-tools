//! The local web server, from the `mhfe serve` command of the MHFE tool by the same author: it
//! answers GET and HEAD for "/" only, checks the Host header against DNS rebinding, ignores request
//! bodies, logs nothing, and gives each connection its own thread and fixed times, so a slow client
//! cannot hold up the page.

use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

/// Longest request head accepted; real browsers send far less.
const MAX_REQUEST_HEAD: usize = 16 * 1024;
/// Time a client has for its whole request head. A limit on each read alone would let a client
/// that sends one byte at a time keep its connection open for ever.
const REQUEST_DEADLINE: Duration = Duration::from_secs(10);
/// Time for sending the whole answer. A limit on each write alone would let a client that reads
/// slowly, or not at all, keep its connection and thread for ever.
const RESPONSE_DEADLINE: Duration = Duration::from_secs(10);
/// Connections answered at the same time; any further one is closed at once. A browser opens
/// only a few, and the cap keeps a flood of connections from starting a thread each.
const MAX_CONNECTIONS: usize = 16;

/// Sent with every response. COOP and COEP make the page cross-origin isolated; the others keep
/// it from being framed, sniffed, cached or followed by a referrer.
const SECURITY_HEADERS: [(&str, &str); 7] = [
    ("Cross-Origin-Opener-Policy", "same-origin"),
    ("Cross-Origin-Embedder-Policy", "require-corp"),
    ("Content-Security-Policy", "frame-ancestors 'none'"),
    ("X-Frame-Options", "DENY"),
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "no-referrer"),
    ("Cache-Control", "no-store"),
];

/// Serves `page` until the program ends.
pub fn serve(listener: TcpListener, host: String, page: &'static [u8]) {
    serve_with_deadline(listener, host, page, REQUEST_DEADLINE);
}

/// Answers every connection in its own thread, at most MAX_CONNECTIONS at a time. A failed
/// connection or a broken request is dropped; the server goes on serving the page.
fn serve_with_deadline(
    listener: TcpListener,
    host: String,
    page: &'static [u8],
    deadline: Duration,
) {
    let host: Arc<str> = host.into();
    let active = Arc::new(AtomicUsize::new(0));
    for stream in listener.incoming().flatten() {
        if active.fetch_add(1, Ordering::SeqCst) >= MAX_CONNECTIONS {
            active.fetch_sub(1, Ordering::SeqCst);
            continue; // Dropping the stream closes the connection.
        }
        let (host, finished) = (Arc::clone(&host), Arc::clone(&active));
        let spawned = thread::Builder::new().spawn(move || {
            let _ = answer(stream, &host, page, deadline);
            finished.fetch_sub(1, Ordering::SeqCst);
        });
        if spawned.is_err() {
            // The thread never ran, so its connection was closed and nothing is counted down.
            active.fetch_sub(1, Ordering::SeqCst);
        }
    }
}

/// Reads one request and writes one response, then closes the connection.
fn answer(stream: TcpStream, host: &str, page: &[u8], deadline: Duration) -> io::Result<()> {
    let mut reader = BufReader::new(UntilDeadline {
        stream: stream.try_clone()?,
        deadline: Instant::now() + deadline,
    });
    let response = match read_request_head(&mut reader) {
        Ok(head) => respond(&head, host, page),
        Err(_) => Response::status(400, "Bad Request"),
    };
    write_until(
        &stream,
        &response.into_bytes(),
        Instant::now() + RESPONSE_DEADLINE,
    )
}

/// Writes all of `bytes`, but gives up at `deadline`; the connection is then closed.
fn write_until(mut stream: &TcpStream, mut bytes: &[u8], deadline: Instant) -> io::Result<()> {
    while !bytes.is_empty() {
        let remaining = deadline.saturating_duration_since(Instant::now());
        // A zero timeout would mean "wait for ever" to the operating system; it is refused.
        if remaining.is_zero() {
            return Err(io::ErrorKind::TimedOut.into());
        }
        stream.set_write_timeout(Some(remaining))?;
        match stream.write(bytes) {
            Ok(0) => return Err(io::ErrorKind::WriteZero.into()),
            Ok(written) => bytes = &bytes[written..],
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

/// A connection that can be read until a fixed moment and then reports a timeout.
struct UntilDeadline {
    stream: TcpStream,
    deadline: Instant,
}

impl Read for UntilDeadline {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        let remaining = self.deadline.saturating_duration_since(Instant::now());
        // A zero timeout would mean "wait for ever" to the operating system; it is refused.
        if remaining.is_zero() {
            return Err(io::ErrorKind::TimedOut.into());
        }
        self.stream.set_read_timeout(Some(remaining))?;
        self.stream.read(buffer)
    }
}

fn read_request_head(reader: &mut impl BufRead) -> io::Result<String> {
    let mut head = String::new();
    let mut limited = reader.take(MAX_REQUEST_HEAD as u64);
    loop {
        let before = head.len();
        if limited.read_line(&mut head)? == 0 {
            return Err(io::ErrorKind::UnexpectedEof.into());
        }
        let line = &head[before..];
        if line == "\r\n" || line == "\n" {
            return Ok(head);
        }
    }
}

struct Response {
    status: u16,
    reason: &'static str,
    content_type: &'static str,
    body: Vec<u8>,
    /// For HEAD: the length of the body a GET would receive, sent without the body.
    head_only: bool,
}

impl Response {
    fn status(status: u16, reason: &'static str) -> Self {
        Self {
            status,
            reason,
            content_type: "text/plain; charset=utf-8",
            body: format!("{status} {reason}\n").into_bytes(),
            head_only: false,
        }
    }

    fn into_bytes(self) -> Vec<u8> {
        let mut bytes = format!(
            "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n",
            self.status,
            self.reason,
            self.content_type,
            self.body.len()
        )
        .into_bytes();
        for (name, value) in SECURITY_HEADERS {
            bytes.extend_from_slice(format!("{name}: {value}\r\n").as_bytes());
        }
        bytes.extend_from_slice(b"\r\n");
        if !self.head_only {
            bytes.extend_from_slice(&self.body);
        }
        bytes
    }
}

/// The whole routing: GET or HEAD of "/" with the exact Host header gets the page, anything
/// else an error. The Host check stops DNS rebinding: a web page on another site whose name
/// was made to resolve to 127.0.0.1 would send its own name as Host.
fn respond(head: &str, host: &str, page: &[u8]) -> Response {
    let mut lines = head.lines();
    let request_line = lines.next().unwrap_or_default();
    let mut parts = request_line.split(' ');
    let (Some(method), Some(target), Some(version), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Response::status(400, "Bad Request");
    };
    if version != "HTTP/1.1" && version != "HTTP/1.0" {
        return Response::status(400, "Bad Request");
    }

    let mut host_headers = lines
        .filter_map(|line| line.split_once(':'))
        .filter(|(name, _)| name.trim().eq_ignore_ascii_case("host"))
        .map(|(_, value)| value.trim());
    let host_matches = host_headers.next() == Some(host) && host_headers.next().is_none();
    if !host_matches {
        return Response::status(403, "Forbidden");
    }

    if target != "/" {
        return Response::status(404, "Not Found");
    }
    match method {
        "GET" | "HEAD" => Response {
            status: 200,
            reason: "OK",
            content_type: "text/html; charset=utf-8",
            body: page.to_vec(),
            head_only: method == "HEAD",
        },
        _ => Response::status(405, "Method Not Allowed"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{Ipv4Addr, SocketAddrV4};

    const HOST: &str = "127.0.0.1:43210";
    const PAGE: &[u8] = b"<!doctype html><title>tool</title>";

    fn request(method: &str, target: &str, host: &str) -> String {
        format!("{method} {target} HTTP/1.1\r\nHost: {host}\r\nUser-Agent: test\r\n\r\n")
    }

    fn text(response: Response) -> String {
        String::from_utf8(response.into_bytes()).unwrap()
    }

    #[test]
    fn serves_the_page_with_every_security_header() {
        let response = text(respond(&request("GET", "/", HOST), HOST, PAGE));
        assert!(response.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(response.contains("Content-Type: text/html; charset=utf-8\r\n"));
        for (name, value) in SECURITY_HEADERS {
            assert!(response.contains(&format!("{name}: {value}\r\n")), "{name}");
        }
        assert!(response.ends_with("<!doctype html><title>tool</title>"));
    }

    #[test]
    fn head_sends_the_headers_without_the_body() {
        let response = text(respond(&request("HEAD", "/", HOST), HOST, PAGE));
        assert!(response.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(response.contains(&format!("Content-Length: {}\r\n", PAGE.len())));
        assert!(response.ends_with("\r\n\r\n"));
    }

    #[test]
    fn refuses_other_hosts_against_dns_rebinding() {
        for host in [
            "localhost:43210",
            "127.0.0.1",
            "127.0.0.1:1",
            "evil.example:43210",
            "",
        ] {
            let response = text(respond(&request("GET", "/", host), HOST, PAGE));
            assert!(response.starts_with("HTTP/1.1 403 Forbidden"), "{host:?}");
        }
        let without_host = "GET / HTTP/1.1\r\n\r\n";
        assert!(text(respond(without_host, HOST, PAGE)).starts_with("HTTP/1.1 403"));
        let two_hosts = format!("GET / HTTP/1.1\r\nHost: {HOST}\r\nHost: {HOST}\r\n\r\n");
        assert!(text(respond(&two_hosts, HOST, PAGE)).starts_with("HTTP/1.1 403"));
    }

    #[test]
    fn refuses_other_paths_and_methods() {
        for target in ["/index.html", "/../", "//", "/?x=1", "*"] {
            let response = text(respond(&request("GET", target, HOST), HOST, PAGE));
            assert!(response.starts_with("HTTP/1.1 404"), "{target}");
        }
        for method in ["POST", "PUT", "DELETE", "OPTIONS", "get"] {
            let response = text(respond(&request(method, "/", HOST), HOST, PAGE));
            assert!(response.starts_with("HTTP/1.1 405"), "{method}");
        }
        for malformed in [
            "GET /\r\n\r\n",
            "GET / HTTP/2\r\nHost: x\r\n\r\n",
            "GET  / HTTP/1.1\r\n\r\n",
        ] {
            assert!(
                text(respond(malformed, HOST, PAGE)).starts_with("HTTP/1.1 400"),
                "{malformed:?}"
            );
        }
    }

    #[test]
    fn stops_reading_an_endless_request_head() {
        let endless = "GET / HTTP/1.1\r\n".to_owned() + &"X-Filler: a\r\n".repeat(5000);
        let mut reader = BufReader::new(endless.as_bytes());
        assert!(read_request_head(&mut reader).is_err());
    }

    /// Starts the server loop on a free port with a short request deadline; returns the port.
    fn start_server(deadline: Duration) -> u16 {
        let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let host = format!("127.0.0.1:{port}");
        thread::spawn(move || serve_with_deadline(listener, host, PAGE, deadline));
        port
    }

    fn get(port: u16) -> String {
        let mut connection = TcpStream::connect(("127.0.0.1", port)).unwrap();
        connection
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let host = format!("127.0.0.1:{port}");
        connection
            .write_all(request("GET", "/", &host).as_bytes())
            .unwrap();
        let mut response = String::new();
        connection.read_to_string(&mut response).unwrap();
        response
    }

    /// A client that never reads a large answer loses its connection at the deadline, although
    /// every single write makes some progress until the buffers are full.
    #[test]
    fn a_client_that_does_not_read_is_dropped_at_the_response_deadline() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let _idle = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        let (server_side, _) = listener.accept().unwrap();
        let answer = vec![b'x'; 64 * 1024 * 1024];
        let started = Instant::now();
        let result = write_until(&server_side, &answer, started + Duration::from_millis(500));
        assert!(
            result.is_err(),
            "the answer cannot fit into the socket buffers"
        );
        assert!(
            started.elapsed() < Duration::from_secs(3),
            "stopped near the deadline"
        );
    }

    #[test]
    fn a_slow_client_neither_holds_up_others_nor_outlives_the_deadline() {
        let port = start_server(Duration::from_millis(500));
        // This client sends one byte of its request head every 100 ms and never finishes it.
        let mut slow = TcpStream::connect(("127.0.0.1", port)).unwrap();
        let mut dripping = slow.try_clone().unwrap();
        thread::spawn(move || {
            for byte in b"GET / HTTP/1.1\r\nX-Slow: aaaaaaaaaaaaaaaaaaaaaaaaaaaaa".iter() {
                if dripping.write_all(&[*byte]).is_err() {
                    break;
                }
                thread::sleep(Duration::from_millis(100));
            }
        });
        let started = Instant::now();
        assert!(get(port).starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(
            started.elapsed() < Duration::from_millis(400),
            "the page came at once"
        );
        slow.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        let mut answer = Vec::new();
        let _ = slow.read_to_end(&mut answer);
        assert!(
            started.elapsed() < Duration::from_secs(2),
            "dropped at its deadline"
        );
    }
}
