#!/usr/bin/env python3
"""Fast mode for an MHFE browser tool, for computers with Python but without the mhfe program.

A browser runs the four Argon2 lanes of MHFE in parallel only on a cross-origin isolated page, and
a page opened as a file is never isolated. This script serves one HTML file from 127.0.0.1 with
the headers that make it isolated, and opens it in the browser. It does what `mhfe serve` does,
with the same limits, and never receives or processes a secret: the page does all the work.

It serves a page only when the checksum file mhfe-fast-mode.sha256 lies next to it and names it
with a matching SHA-256; otherwise it refuses with a message and serves nothing.

Usage:
    python3 mhfe-fast-mode.py              serve the page named in the mhfe-fast-mode.sha256 next
                                           to this script, as a double-click does
    python3 mhfe-fast-mode.py tool.html    serve tool.html; mhfe-fast-mode.sha256 must lie next
                                           to it and name it
    --no-browser                           print the address instead of opening the browser

Needs Python 3.8 or later and nothing else. It answers GET and HEAD of "/" only, checks the Host
header against DNS rebinding, ignores request bodies and logs nothing.
"""

import argparse
import hashlib
import os
import socket
import sys
import threading
import time
import webbrowser

# The same limits as `mhfe serve` (src/bin/mhfe/serve.rs).
# Longest request head accepted; real browsers send far less.
MAX_REQUEST_HEAD = 16 * 1024
# Seconds a client has for its whole request head. A limit on each read alone would let a client
# that sends one byte at a time keep its connection open for ever.
REQUEST_DEADLINE = 10.0
# Seconds for sending the whole answer. Since Python 3.5 a socket timeout limits the total time
# of sendall, not each piece it sends, so a client that reads slowly cannot stretch it.
RESPONSE_DEADLINE = 10.0
# Connections answered at the same time; any further one is closed at once. A browser opens only
# a few, and the cap keeps a flood of connections from starting a thread each.
MAX_CONNECTIONS = 16
# Seconds the listener waits for a connection before it looks again. On Windows a waiting
# accept() does not notice Ctrl+C, so the wait is kept short.
ACCEPT_INTERVAL = 1.0

# Sent with every response. COOP and COEP make the page cross-origin isolated; the others keep it
# from being framed, sniffed, cached or followed by a referrer.
SECURITY_HEADERS = (
    ("Cross-Origin-Opener-Policy", "same-origin"),
    ("Cross-Origin-Embedder-Policy", "require-corp"),
    ("Content-Security-Policy", "frame-ancestors 'none'"),
    ("X-Frame-Options", "DENY"),
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "no-referrer"),
    ("Cache-Control", "no-store"),
)

# The checksum file that must lie next to the page, as for `mhfe serve`. Its name never changes,
# so a tool can ship it beside its HTML file. It holds one line in the format sha256sum writes:
# the SHA-256 of the page, two spaces and the page's file name.
CHECKSUM_FILE = "mhfe-fast-mode.sha256"

# Exit codes, as the mhfe program uses them.
SUCCESS = 0
INVALID_INPUT = 2


class Refused(Exception):
    """The file cannot be served; the message says why."""


def response(status, reason, body, content_type="text/plain; charset=utf-8", head_only=False):
    """One complete HTTP response. For HEAD the length of the body is sent without the body."""
    lines = [
        "HTTP/1.1 {} {}".format(status, reason),
        "Content-Type: {}".format(content_type),
        "Content-Length: {}".format(len(body)),
        "Connection: close",
    ]
    lines += ["{}: {}".format(name, value) for name, value in SECURITY_HEADERS]
    head = ("\r\n".join(lines) + "\r\n\r\n").encode("ascii")
    return head if head_only else head + body


def error_response(status, reason):
    return response(status, reason, "{} {}\n".format(status, reason).encode("ascii"))


def respond(head, host, page):
    """The whole routing: GET or HEAD of "/" with the exact Host header gets the page, anything
    else an error. The Host check stops DNS rebinding: a web page on another site whose name was
    made to resolve to 127.0.0.1 would send its own name as Host."""
    lines = head.split("\n")
    request_line = lines[0].rstrip("\r")
    parts = request_line.split(" ")
    if len(parts) != 3 or "" in parts:
        return error_response(400, "Bad Request")
    method, target, version = parts
    if version not in ("HTTP/1.1", "HTTP/1.0"):
        return error_response(400, "Bad Request")

    hosts = []
    for line in lines[1:]:
        name, colon, value = line.partition(":")
        if colon and name.strip().lower() == "host":
            hosts.append(value.strip())
    if hosts != [host]:
        return error_response(403, "Forbidden")

    if target != "/":
        return error_response(404, "Not Found")
    if method not in ("GET", "HEAD"):
        return error_response(405, "Method Not Allowed")
    return response(200, "OK", page, "text/html; charset=utf-8", head_only=method == "HEAD")


def read_request_head(connection, deadline):
    """The request head up to its empty line, as text. Raises ValueError for a head that is too
    long, ends early or is not ASCII, and socket.timeout once `deadline` has passed."""
    received = b""
    while True:
        end = received.find(b"\r\n\r\n")
        if end < 0:
            # A bare line feed also ends a line, as in the Rust version.
            end = received.find(b"\n\n")
        if end >= 0:
            return received[:end].decode("ascii")
        if len(received) >= MAX_REQUEST_HEAD:
            raise ValueError("request head too long")
        remaining = deadline - time.monotonic()
        # A zero or negative timeout would not wait at all or would mean "for ever".
        if remaining <= 0:
            raise socket.timeout("request deadline passed")
        connection.settimeout(remaining)
        chunk = connection.recv(MAX_REQUEST_HEAD - len(received))
        if not chunk:
            raise ValueError("the connection closed before the end of the request head")
        received += chunk


def answer(connection, host, page, deadline_seconds):
    """Reads one request and writes one response, then closes the connection."""
    try:
        try:
            head = read_request_head(connection, time.monotonic() + deadline_seconds)
            reply = respond(head, host, page)
        except (ValueError, UnicodeDecodeError):
            reply = error_response(400, "Bad Request")
        connection.settimeout(RESPONSE_DEADLINE)
        connection.sendall(reply)
    except OSError:
        pass  # A failed or slow connection is dropped; the server goes on serving the page.
    finally:
        connection.close()


def serve(listener, host, page, deadline_seconds=REQUEST_DEADLINE):
    """Answers every connection in its own thread, at most MAX_CONNECTIONS at a time."""
    slots = threading.BoundedSemaphore(MAX_CONNECTIONS)
    listener.settimeout(ACCEPT_INTERVAL)

    def handle(connection):
        try:
            answer(connection, host, page, deadline_seconds)
        finally:
            slots.release()

    while True:
        try:
            connection, _ = listener.accept()
        except socket.timeout:
            continue  # No connection yet; looking again lets Ctrl+C through.
        except OSError:
            return  # The listener was closed.
        if not slots.acquire(blocking=False):
            connection.close()
            continue
        try:
            threading.Thread(target=handle, args=(connection,), daemon=True).start()
        except RuntimeError:
            # The thread never ran, so its connection is closed here and its slot given back.
            connection.close()
            slots.release()


def sha256_of(data):
    return hashlib.sha256(data).hexdigest()


def read_checksum_file(directory):
    """The SHA-256 and the page name from the checksum file in `directory`."""
    path = os.path.join(directory, CHECKSUM_FILE)
    try:
        with open(path, encoding="utf-8") as file:
            text = file.read()
    except OSError as error:
        raise Refused(
            "There is no readable {} in {}: {}. The fast mode serves a page only when its checksum "
            "file lies next to it; nothing was served.".format(
                CHECKSUM_FILE, directory, error.strerror or error
            )
        )
    malformed = Refused(
        '{} must hold exactly one line, "<SHA-256>  <page>.html"; nothing was served.'.format(path)
    )
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) != 1:
        raise malformed
    # The format sha256sum writes: 64 hex digits, two spaces, the file name ("*" marks binary
    # mode). The name is a plain file name next to the checksum file, never a path.
    digest, separator, name = lines[0].partition("  ")
    name = name.rstrip().lstrip("*")
    plain_name = "/" not in name and "\\" not in name and name not in (".", "..")
    hexadecimal = len(digest) == 64 and all(c in "0123456789abcdefABCDEF" for c in digest)
    if not (separator and hexadecimal and name.endswith(".html") and plain_name):
        raise malformed
    return digest.lower(), name


def load_checked_page(path):
    """The page, read once, after its checksum file next to it has named it with a matching
    SHA-256. Raises Refused otherwise."""
    directory = os.path.dirname(os.path.abspath(path))
    expected, listed_name = read_checksum_file(directory)
    if listed_name != os.path.basename(path):
        raise Refused(
            "{} names {}, not {}; nothing was served.".format(
                CHECKSUM_FILE, listed_name, os.path.basename(path)
            )
        )
    try:
        with open(path, "rb") as file:
            page = file.read()
    except OSError as error:
        raise Refused("Cannot read {}: {}; nothing was served.".format(path, error.strerror or error))
    digest = sha256_of(page)
    if digest != expected:
        raise Refused(
            "The SHA-256 of {} is {}, but {} expects {}. The page has changed or is not the one "
            "released; nothing was served.".format(os.path.basename(path), digest, CHECKSUM_FILE, expected)
        )
    return page, digest


def main(arguments):
    parser = argparse.ArgumentParser(
        prog="mhfe-fast-mode.py",
        description="Serve an MHFE browser tool on this computer (127.0.0.1) in fast mode.",
    )
    parser.add_argument(
        "file", nargs="?", help="the HTML file; {} must lie next to it".format(CHECKSUM_FILE)
    )
    parser.add_argument(
        "--no-browser", action="store_true", help="print the address instead of opening the browser"
    )
    options = parser.parse_args(arguments)

    try:
        if options.file is None:
            here = os.path.dirname(os.path.abspath(__file__))
            if not os.path.isfile(os.path.join(here, CHECKSUM_FILE)):
                print(
                    "Put the tool's HTML file and its checksum file {} next to this script, or\n"
                    "run: python3 mhfe-fast-mode.py <file.html>".format(CHECKSUM_FILE),
                    file=sys.stderr,
                )
                return INVALID_INPUT
            path = os.path.join(here, read_checksum_file(here)[1])
        else:
            path = options.file
        page, digest = load_checked_page(path)
    except Refused as refusal:
        print("Error: {}".format(refusal), file=sys.stderr)
        return INVALID_INPUT
    print("SHA-256 of {} verified: {}".format(os.path.basename(path), digest), file=sys.stderr)

    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.bind(("127.0.0.1", 0))
    listener.listen(MAX_CONNECTIONS)
    port = listener.getsockname()[1]
    address = "http://127.0.0.1:{}/".format(port)
    # The address holds no secret, so handing it to the browser is safe.
    if options.no_browser or not webbrowser.open(address):
        print("Open {} in your browser.".format(address), file=sys.stderr)
    print("Fast mode is running. Close this window or press Ctrl+C to stop.", file=sys.stderr)
    try:
        serve(listener, "127.0.0.1:{}".format(port), page)
    except KeyboardInterrupt:
        print("\nStopped.", file=sys.stderr)
    finally:
        listener.close()
    return SUCCESS


def started_by_double_click(arguments):
    """Without arguments in a terminal window of its own, as a double-click starts it."""
    return not arguments and sys.stdin is not None and sys.stdin.isatty()


if __name__ == "__main__":
    code = main(sys.argv[1:])
    if code != SUCCESS and started_by_double_click(sys.argv[1:]):
        # Keep the window open so that the message can be read.
        input("Press Enter to close.")
    sys.exit(code)
