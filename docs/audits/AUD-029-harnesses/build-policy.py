"""Check changed build admission rules without running a release build."""

import pathlib
import subprocess


class BuildPolicyChecks:
    def __init__(self, root):
        self._root = root

    def run(self):
        subprocess.run(
            ["pnpm", "exec", "vitest", "run",
             "tooling/docker-build-limits.test.mjs",
             "tooling/build-reproducible.test.mjs",
             "tooling/audit-metadata.test.mjs",
             "tooling/remediation-contracts.test.mjs",
             "tooling/wasm-source-bindings.test.mjs",
             "--maxWorkers=1", "--no-file-parallelism"],
            cwd=self._root, check=True,
        )
        subprocess.run(
            ["node", "tooling/verify-reproducible-container.mjs"],
            cwd=self._root, check=True,
        )


if __name__ == "__main__":
    BuildPolicyChecks(pathlib.Path(__file__).resolve().parents[3]).run()
