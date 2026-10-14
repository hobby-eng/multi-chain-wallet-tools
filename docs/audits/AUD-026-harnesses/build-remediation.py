"""Build bounded HTML cases one at a time, without browsers, WASM regeneration or a release bundle."""
import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "AUD-027-harnesses"))
from capture import ReviewCommand

SCRIPTS = {
    "key-derivation": "apps/key-derivation/scripts/build-key-derivation-html.mjs",
    "activity-viewer": "apps/activity-viewer/scripts/build-activity-viewer-html.mjs",
    "discovery-scanner": "apps/discovery-scanner/scripts/build-discovery-scanner-html.mjs",
    "psbt-inspector": "apps/psbt-inspector/scripts/build-psbt-inspector-html.mjs",
}
if __name__ == "__main__":
    mode = sys.argv[1]
    prefix = sys.argv[2] if len(sys.argv) > 2 else "remediation"
    cases = []
    if mode == "watch":
        for profile, coin in [("multi-chain", "bitcoin"), ("multi-chain", "ethereum"),
                              ("multi-chain", "dash"), ("dash-community", "dash")]:
            cases.append((f"{prefix}-watch-{profile}-{coin}", [
                "node", SCRIPTS["discovery-scanner"], "--profile", profile,
                "--coins", coin, "--features", "watch-only-discovery", "--output",
                f"dist/custom-builds/AUD-026-watch-{profile}-{coin}.html"]))
    elif mode in {"default", "artifacts"}:
        for profile in ["multi-chain", "dash-community"]:
            for tool, script in SCRIPTS.items():
                if mode == "artifacts":
                    script = script.replace("/build-", "/verify-").replace("-html.mjs", "-artifact.mjs")
                cases.append((f"{prefix}-{mode}-{profile}-{tool}", ["node", script, "--profile", profile]))
    else:
        raise SystemExit("Usage: build-remediation.py <watch|default|artifacts> [fresh-prefix]")
    for name, command in cases:
        result = ReviewCommand(name, command, audit_number=26).run()
        if result != 0:
            raise SystemExit(result)
