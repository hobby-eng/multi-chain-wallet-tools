"""Retain bounded review commands and the source bytes present before and after them."""

import datetime
import hashlib
import json
import pathlib
import subprocess
import sys


class ReviewCommand:
    """A command owns its log and source-attribution records, never product source."""

    def __init__(self, name, command, audit_number=27):
        self.root = pathlib.Path(__file__).resolve().parents[3]
        self.evidence = self.root / f"docs/audits/AUD-{audit_number:03d}-evidence"
        self.name = name
        self.command = command

    def source(self):
        paths = subprocess.check_output(
            ["git", "ls-files", "-co", "--exclude-standard", "-z"], cwd=self.root
        ).decode().split("\0")
        files = []
        for path in sorted(set(paths) - {""}):
            if path.startswith("docs/audits/"):
                continue
            source = self.root / path
            if source.is_file():
                data = source.read_bytes()
                files.append({"path": path, "sha256": hashlib.sha256(data).hexdigest()})
        text = "".join(f"{item['sha256']}  {item['path']}\n" for item in files)
        return {"fingerprint": hashlib.sha256(text.encode()).hexdigest(), "files": files}

    def run(self):
        log_path = self.evidence / f"{self.name}.log"
        record_path = self.evidence / f"{self.name}.command.json"
        if log_path.exists() or record_path.exists():
            raise SystemExit("Use a fresh capture name; original evidence is not overwritten.")
        before = self.source()
        started = datetime.datetime.now(datetime.UTC).isoformat()
        # The audit never requests a long release check. Bound unexpected hangs as evidence.
        try:
            result = subprocess.run(
                self.command, cwd=self.root, capture_output=True, timeout=90
            )
            output = result.stdout + result.stderr
            code = result.returncode
            timed_out = False
        except subprocess.TimeoutExpired as cause:
            output = (cause.stdout or b"") + (cause.stderr or b"")
            code = 124
            timed_out = True
        after = self.source()
        a = {item["path"]: item["sha256"] for item in before["files"]}
        b = {item["path"]: item["sha256"] for item in after["files"]}
        changed = [path for path in sorted(a.keys() | b.keys()) if a.get(path) != b.get(path)]
        log_path.write_bytes(output)
        record = {
            "command": self.command,
            "cwd": str(self.root),
            "startedAtUtc": started,
            "endedAtUtc": datetime.datetime.now(datetime.UTC).isoformat(),
            "exitCode": code,
            "timedOut": timed_out,
            "logSha256": hashlib.sha256(output).hexdigest(),
            "sourceBefore": before["fingerprint"],
            "sourceAfter": after["fingerprint"],
            "sourceChangesDuringCommand": changed,
        }
        record_path.write_text(json.dumps(record, indent=2) + "\n")
        (self.evidence / f"{self.name}.source-before.json").write_text(
            json.dumps(before, indent=2) + "\n"
        )
        (self.evidence / f"{self.name}.source-after.json").write_text(
            json.dumps(after, indent=2) + "\n"
        )
        print(output.decode(errors="replace"), end="")
        if changed:
            print(json.dumps({"sourceChangesDuringCommand": changed}))
        return code


if __name__ == "__main__":
    name, *command = sys.argv[1:]
    if not name.replace("-", "").replace("_", "").isalnum() or not command:
        raise SystemExit("Usage: capture.py <fresh-name> <command> [arguments]")
    raise SystemExit(ReviewCommand(name, command).run())
