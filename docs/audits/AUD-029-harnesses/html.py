"""Build/check default pages only; no full matrix or release bundle."""

import pathlib
import subprocess
import sys


class DefaultHtmlChecks:
    """Select each tool explicitly so the orchestrator does not assemble release manifests."""

    _tools = ["key-derivation", "activity-viewer", "discovery-scanner", "psbt-inspector"]

    def __init__(self, root):
        self._root = root

    def run(self, check):
        for tool in self._tools:
            if check:
                for profile in ["multi-chain", "dash-community"]:
                    script = f"apps/{tool}/scripts/verify-{tool}-artifact.mjs"
                    self._node([script, "--profile", profile])
            else:
                self._node(["tooling/build-html-profiles.mjs", "--tool", tool])

    def _node(self, arguments):
        subprocess.run(["node", *arguments], cwd=self._root, check=True)


if __name__ == "__main__":
    DefaultHtmlChecks(pathlib.Path(__file__).resolve().parents[3]).run("--check" in sys.argv)
