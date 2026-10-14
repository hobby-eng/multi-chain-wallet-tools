"""Execute the explicitly selected remediation files, never discover a full suite."""

import json
import pathlib
import subprocess


class TargetedRemediationChecks:
    def __init__(self, root):
        self._root = root

    def run(self):
        path = pathlib.Path(__file__).with_name("targeted-files.json")
        files = json.loads(path.read_text())
        if len(files) != len(set(files)) or not files:
            raise RuntimeError("The targeted file list must be nonempty and unique.")
        subprocess.run(
            ["pnpm", "exec", "vitest", "run", *files, "--maxWorkers=1", "--no-file-parallelism"],
            cwd=self._root, check=True,
        )


if __name__ == "__main__":
    TargetedRemediationChecks(pathlib.Path(__file__).resolve().parents[3]).run()
