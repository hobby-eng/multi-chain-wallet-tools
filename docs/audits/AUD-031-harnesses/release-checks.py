"""AUD-031 release-level checks: the steps of `pnpm verify` and the other documented release
commands, each captured on its own by AUD-028's AuditCapture (evidence, source hashes before and
after, the shared heavy-check lock, the memory reserve and a timeout).

`pnpm verify` runs `vitest run` with one worker per processor; on the audited 15 GB laptop that
is run here as `vitest run --maxWorkers=4`, the only change to its steps. Every step runs even
after one fails, so that one failure does not hide the state of the others. Exit status 1 when a
step fails or was stopped.

Usage, from the repository root:
  python3 docs/audits/AUD-031-harnesses/release-checks.py <group> [<prefix>]
Groups: source, verify, matrix, docker, browser, layout. Evidence names start with <prefix>
(default: the group) and must be new.
"""

import importlib.util
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
AUDIT_NUMBER = 31
WORKSPACE = ROOT.parent
# A Node or Docker step may use this much; the capture also stops it when the host has less
# than its 1.2 GiB reserve left.
SCOPE = ["systemd-run", "--user", "--scope", "-q", "-p", "MemoryMax=6G"]
HOUR = 3600

GROUPS = {
    "source": [
        ("metadata", ["pnpm", "metadata:check"], 300),
        ("typecheck-copies", ["pnpm", "check"], 900),
        ("format", ["pnpm", "format:check"], 900),
        ("format-docs", ["pnpm", "exec", "prettier", "--check", "**/*.md", "docs/**/*.json",
                         "!docs/audits/**", "!**/node_modules/**"], 900),
        ("npm-advisories", ["pnpm", "audit", "--audit-level", "high"], 600),
    ],
    # The steps of `pnpm verify`, in its order (package.json).
    "verify": [
        ("verify-01-metadata", ["node", "tooling/sync-project-metadata.mjs", "--check"], 300),
        ("verify-02-facts", ["node", "tooling/verify-project-facts.mjs"], 300),
        ("verify-03-container", ["node", "tooling/verify-reproducible-container.mjs"], 300),
        ("verify-04-provenance", ["node", "tooling/verify-dependency-provenance.mjs"], 600),
        ("verify-05-wasm-producers", ["node", "tooling/verify-wasm-producers.mjs"], 600),
        ("verify-06-tsc", ["pnpm", "exec", "tsc", "--noEmit"], 900),
        ("verify-07-vitest", [*SCOPE, "pnpm", "exec", "vitest", "run", "--maxWorkers=4"], 2 * HOUR),
        ("verify-08-dip13", ["node", "tooling/verify-dip13-vectors.mjs"], 900),
        ("verify-09-shielded-stream",
         ["node", "apps/discovery-scanner/scripts/verify-shielded-stream.mjs"], 900),
        ("verify-10-self-test", ["node", "apps/key-derivation/scripts/verify-self-test.mjs"], 900),
        ("verify-11-dash-self-test",
         ["node", "apps/key-derivation/scripts/verify-dash-self-test.mjs"], 900),
        ("verify-12-rust", [*SCOPE, "node", "tooling/test-rust.mjs"], 3 * HOUR),
        ("verify-13-html", [*SCOPE, "node", "tooling/build-html-profiles.mjs"], HOUR),
        ("verify-14-shielded-wasm", ["node", "tooling/verify-shielded-wasm.mjs"], 900),
        ("verify-15-reproducible",
         [*SCOPE, "node", "tooling/verify-reproducible-build.mjs", "--reuse-generated-wasm"],
         2 * HOUR),
        ("verify-16-artifact-profiles", ["node", "tooling/verify-artifact-profiles.mjs"], HOUR),
        ("verify-17-record", ["node", "tooling/create-verification-record.mjs", "--mode", "full"],
         900),
        ("verify-18-assets", ["node", "tooling/create-github-release-assets.mjs"], 900),
        ("verify-19-assets-check", ["node", "tooling/verify-github-release-assets.mjs"], 900),
        ("verify-20-dash-assets",
         ["node", "tooling/create-github-release-assets.mjs", "--profile", "dash-community"], 900),
        ("verify-21-dash-assets-check",
         ["node", "tooling/verify-github-release-assets.mjs", "--profile", "dash-community"], 900),
        ("verify-22-record-check", ["node", "tooling/verify-verification-record.mjs"], 900),
    ],
    "matrix": [
        ("matrix-plan", ["pnpm", "build:matrix:plan"], 900),
        ("matrix-smoke-plan", ["pnpm", "build:matrix:smoke:plan"], 900),
        ("matrix-smoke", [*SCOPE, "pnpm", "build:matrix:smoke"], 3 * HOUR),
    ],
    "docker": [
        ("docker-reproducible", ["./tooling/build-reproducible.sh"], 6 * HOUR),
    ],
    "browser": [
        ("browser-files", [*SCOPE, "pnpm", "test:browser:files"], 2 * HOUR),
        ("browser-regressions", [*SCOPE, "pnpm", "test:browser:regressions"], 4 * HOUR),
        ("browser-selective", [*SCOPE, "pnpm", "test:browser:selective"], 2 * HOUR),
    ],
    "layout": [
        ("layout-self-test", ["node", "tooling/check-layout.mjs", "--self-test"], 600),
        ("layout", [*SCOPE, "node", "tooling/check-layout.mjs", "--profile", "all"], 2 * HOUR),
    ],
}


def load_capture():
    path = ROOT / "docs/audits/AUD-028-harnesses/capture.py"
    spec = importlib.util.spec_from_file_location("aud028_capture", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.AuditCapture(ROOT, AUDIT_NUMBER)


def main():
    group = sys.argv[1] if len(sys.argv) > 1 else ""
    if group not in GROUPS:
        raise SystemExit(f"Choose a group: {', '.join(GROUPS)}.")
    prefix = sys.argv[2] if len(sys.argv) > 2 else group
    # The workspace's own toolchain homes (AGENTS.md, Toolchains).
    os.environ.setdefault("CARGO_HOME", str(WORKSPACE / "workingspace/cargo"))
    os.environ.setdefault("RUSTUP_HOME", str(WORKSPACE / "workingspace/rustup"))
    capture = load_capture()
    results = []
    for name, command, timeout in GROUPS[group]:
        os.environ["AUDIT_TIMEOUT_SECONDS"] = str(timeout)
        evidence = name if prefix == group else f"{prefix}-{name}"
        print(f"=== {evidence}: {' '.join(command)}", flush=True)
        code = capture.run(evidence, command)
        results.append((evidence, code))
    print("=== summary")
    for evidence, code in results:
        print(f"{'PASS' if code == 0 else 'FAIL'} {evidence} (exit {code})")
    return 0 if all(code == 0 for _, code in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
