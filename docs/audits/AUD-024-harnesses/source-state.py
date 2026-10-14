"""Bind a source review to current checkout bytes without copying source files."""

import argparse
import hashlib
import json
import pathlib
import subprocess


class SourceSnapshot:
    """A checkout owns its Git inventory and the fingerprint of those files."""

    def __init__(self, root):
        self.root = root.resolve()

    def capture(self):
        output = subprocess.check_output(
            ["git", "ls-files", "-co", "--exclude-standard", "-z"], cwd=self.root
        )
        paths = sorted(set(output.decode().split("\0")) - {""})
        files = []
        for path in paths:
            if path.startswith("docs/audits/"):
                continue
            source = self.root / path
            if source.is_file():
                data = source.read_bytes()
                files.append(
                    {"path": path, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                )
        # Include paths as well as bytes: a rename is a different source state.
        text = "".join(f"{item['sha256']}  {item['path']}\n" for item in files)
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=self.root)
        return {
            "commit": commit.decode().strip(),
            "sourceFingerprint": hashlib.sha256(text.encode()).hexdigest(),
            "files": files,
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=pathlib.Path)
    parser.add_argument("output", type=pathlib.Path)
    parser.add_argument("--compare", type=pathlib.Path)
    options = parser.parse_args()
    state = SourceSnapshot(options.root).capture()
    options.output.write_text(json.dumps(state, indent=2) + "\n")
    if options.compare:
        baseline = json.loads(options.compare.read_text())
        baseline = baseline["files"] if isinstance(baseline, dict) else baseline
        before = {item["path"]: item["sha256"] for item in baseline}
        after = {item["path"]: item["sha256"] for item in state["files"]}
        changed = [path for path in sorted(before.keys() | after.keys()) if before.get(path) != after.get(path)]
        print(json.dumps({"sourceFingerprint": state["sourceFingerprint"], "changed": changed}, indent=2))
        raise SystemExit(1 if changed else 0)
    print(json.dumps({key: value for key, value in state.items() if key != "files"}, indent=2))
