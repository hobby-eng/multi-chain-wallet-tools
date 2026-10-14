"""Run only native regressions that are required for AUD-028 remediation."""

import os
import pathlib
import subprocess


class NativeRemediationChecks:
    """Use the managed toolchain, serialized native targets and no password KDF tests."""

    def __init__(self, root):
        self._root = root
        self._home = root.parent / "workingspace"

    def run(self):
        cargo_home = self._home / "cargo"
        for package, target, selected in [
            ("recovery-codex32-wasm", "codex32", []),
            ("recovery-envelope-wasm", "envelope", ["recipient::tests"]),
        ]:
            environment = {
                **os.environ,
                "CARGO_HOME": str(cargo_home),
                "RUSTUP_HOME": str(self._home / "rustup"),
                "CARGO_TARGET_DIR": str(cargo_home / "targets" / target),
                "CARGO_BUILD_JOBS": "1",
            }
            subprocess.run(
                [str(cargo_home / "bin/cargo"), "test", "--manifest-path",
                 f"packages/{package}/rust/Cargo.toml", "--locked", "--offline", "--lib", *selected],
                cwd=self._root, env=environment, check=True,
            )


if __name__ == "__main__":
    NativeRemediationChecks(pathlib.Path(__file__).resolve().parents[3]).run()
