"""Capture bounded baseline checks without changing product inputs."""

import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import signal
import subprocess
import sys
import time


class AuditCapture:
    """Own one command's evidence and enforce serialized, bounded execution."""

    def __init__(self, root, number):
        self.root = pathlib.Path(root).resolve()
        self.evidence = self.root / f"docs/audits/AUD-{number:03d}-evidence"
        self.evidence.mkdir(parents=True, exist_ok=True)

    def source(self):
        paths = subprocess.check_output(
            ["git", "ls-files", "-co", "--exclude-standard", "-z"], cwd=self.root
        ).decode().split("\0")
        files = []
        for path in sorted(set(paths) - {""}):
            if path.startswith("docs/audits/"):
                continue
            file = self.root / path
            if file.is_file():
                files.append({"path": path, "sha256": self.hash_file(file)})
        canonical = "".join(f"{file['sha256']}  {file['path']}\n" for file in files)
        return {"fingerprint": hashlib.sha256(canonical.encode()).hexdigest(), "files": files}

    @staticmethod
    def hash_file(path):
        digest = hashlib.sha256()
        with open(path, "rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @staticmethod
    def available_kib():
        for line in pathlib.Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1])
        raise RuntimeError("MemAvailable is required for this laptop's audit.")

    def save(self, name, value):
        path = self.evidence / name
        if path.exists():
            raise RuntimeError("Original audit evidence must not be overwritten.")
        path.write_text(json.dumps(value, indent=2) + "\n")

    def snapshot(self, name):
        self.save(f"{name}.source.json", self.source())
        facts = {}
        for key, args in {
            "head": ["rev-parse", "HEAD"],
            "branch": ["branch", "--show-current"],
            "status": ["status", "--porcelain=v1"],
            "gitDirectory": ["rev-parse", "--git-dir"],
            "commonDirectory": ["rev-parse", "--git-common-dir"],
            "remotes": ["remote", "-v"],
        }.items():
            facts[key] = subprocess.check_output(["git", *args], cwd=self.root).decode()
        facts["capturedAtUtc"] = datetime.datetime.now(datetime.UTC).isoformat()
        facts["availableKiB"] = self.available_kib()
        self.save(f"{name}.identity.json", facts)
        diff = self.evidence / f"{name}.diff"
        with diff.open("xb") as stream:
            subprocess.run(["git", "diff", "HEAD", "--", ".", ":(exclude)docs/audits"],
                           cwd=self.root, stdout=stream, check=True)
        artifacts = []
        for path in sorted((self.root / "dist").rglob("*")):
            if path.is_file() and path.suffix in {".html", ".json", ".wasm", ".sha256"}:
                artifacts.append({"path": str(path.relative_to(self.root)),
                                  "sha256": self.hash_file(path), "bytes": path.stat().st_size})
        self.save(f"{name}.artifacts.json", artifacts)
        print(json.dumps({"sourceFingerprint": self.source()["fingerprint"],
                          "files": len(self.source()["files"]), "artifacts": len(artifacts)}))

    def run(self, name, command):
        # Leave at least 1.2 GiB available; host processes are outside this harness's control.
        reserve_kib = 1200 * 1024
        timeout_seconds = int(os.environ.get("AUDIT_TIMEOUT_SECONDS", "120"))
        record_path = self.evidence / f"{name}.command.json"
        log_path = self.evidence / f"{name}.log"
        if record_path.exists() or log_path.exists():
            raise RuntimeError("Use a fresh evidence name.")
        before = self.source()
        started = datetime.datetime.now(datetime.UTC).isoformat()
        minimum_available = self.available_kib()
        stopped = None
        code = 125
        with open("/tmp/wallet-tools-heavy-check.lock", "a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            with log_path.open("xb") as log:
                if minimum_available < reserve_kib:
                    stopped = "insufficient-memory-before-start"
                    log.write((stopped + "\n").encode())
                else:
                    env = {**os.environ, "NODE_OPTIONS": "--max-old-space-size=1536",
                           "CARGO_BUILD_JOBS": "1"}
                    process = subprocess.Popen(command, cwd=self.root, env=env,
                                               stdout=log, stderr=subprocess.STDOUT,
                                               start_new_session=True)
                    deadline = time.monotonic() + timeout_seconds
                    try:
                        while process.poll() is None:
                            available = self.available_kib()
                            minimum_available = min(minimum_available, available)
                            if available < reserve_kib or time.monotonic() > deadline:
                                stopped = "memory-reserve" if available < reserve_kib else "timeout"
                                break
                            time.sleep(0.2)
                    except KeyboardInterrupt:
                        stopped = "interrupted"
                    finally:
                        if process.poll() is None:
                            os.killpg(process.pid, signal.SIGTERM)
                            try:
                                process.wait(timeout=3)
                            except subprocess.TimeoutExpired:
                                os.killpg(process.pid, signal.SIGKILL)
                    code = process.wait()
        after = self.source()
        a = {file["path"]: file["sha256"] for file in before["files"]}
        b = {file["path"]: file["sha256"] for file in after["files"]}
        self.save(f"{name}.source-before.json", before)
        self.save(f"{name}.source-after.json", after)
        record = {"command": command, "cwd": str(self.root), "startedAtUtc": started,
                  "endedAtUtc": datetime.datetime.now(datetime.UTC).isoformat(),
                  "exitCode": code, "stopped": stopped,
                  "environment": {"NODE_OPTIONS": "--max-old-space-size=1536", "CARGO_BUILD_JOBS": "1"},
                  "memoryReserveKiB": reserve_kib, "minimumAvailableKiB": minimum_available,
                  "sourceBefore": before["fingerprint"], "sourceAfter": after["fingerprint"],
                  "sourceChangesDuringCommand": [p for p in sorted(a.keys() | b.keys()) if a.get(p) != b.get(p)],
                  "logSha256": self.hash_file(log_path)}
        self.save(record_path.name, record)
        print(log_path.read_text(errors="replace"), end="")
        print(json.dumps({"exitCode": code, "stopped": stopped, "minimumAvailableKiB": minimum_available}))
        return code


if __name__ == "__main__":
    root, number, name, *command = sys.argv[1:]
    capture = AuditCapture(root, int(number))
    if not name.replace("-", "").replace("_", "").isalnum():
        raise SystemExit("Invalid evidence name.")
    if command == ["--snapshot"]:
        capture.snapshot(name)
    elif command:
        raise SystemExit(capture.run(name, command))
    else:
        raise SystemExit("Usage: capture.py <root> <number> <fresh-name> <command...|--snapshot>")
