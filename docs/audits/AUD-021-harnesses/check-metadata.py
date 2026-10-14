"""Compare displayed build metadata with the actual canonical WASM input pin."""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
crate = ROOT / "packages/dash-shielded-wasm/rust/Cargo.toml"
expected = re.search(r'^wasm-bindgen = "=([0-9.]+)"$', crate.read_text(), re.M)[1]
failures = []
for edition in ("multi-chain-edition", "dash-community-edition"):
    for tool in ("activity-viewer", "discovery-scanner", "key-derivation"):
        pages = list((ROOT / "dist" / edition / tool).glob("*.html"))
        assert len(pages) == 1, (edition, tool)
        page = pages[0]
        # This exact phrase is the rendered release passport, rather than bundled glue internals.
        matches = re.findall(r"wasm-bindgen (0\.2\.[0-9]+)", page.read_text())
        assert len(matches) == 1, (page, matches)
        actual = matches[0]
        if actual != expected:
            failures.append(page.relative_to(ROOT).as_posix())
            print(f"FAIL {failures[-1]}: passport={actual}, pinned WASM dependency={expected}")
        else:
            print(f"PASS {page.relative_to(ROOT)}: passport={actual}")
print(f"Displayed metadata comparison: {6 - len(failures)} PASS, {len(failures)} FAIL")
sys.exit(1 if failures else 0)
