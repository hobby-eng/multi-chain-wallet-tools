# AUD-023 build reviewer harness: resolves every relative Markdown link (and its #anchor, with
# GitHub's heading slugs) in the documents of the build reviewer's scope, and reports non-ASCII
# letters outside code that could signal non-English text. Read only. Exits 1 on a broken link.
#
#   python3 docs/audits/AUD-023-harnesses/build-doc-links.py
import os, re, sys

DOCS = ["README.md", "RELEASING.md", "THIRD_PARTY_NOTICES.md", "docs/BUILD_MODULES.md",
        "docs/ROADMAP.md", "docs/MNEMOCODE_SOURCE.md", "docs/distributions/dash-community/README.md",
        "apps/key-derivation/README.md", "apps/activity-viewer/README.md",
        "apps/discovery-scanner/README.md", "apps/psbt-inspector/README.md"]

def slugs(path):
    out, seen = set(), {}
    in_fence = False
    for line in open(path, encoding="utf8"):
        if line.lstrip().startswith(("```", "~~~")):
            in_fence = not in_fence
        if in_fence or not line.startswith("#"):
            continue
        text = line.lstrip("#").strip()
        text = re.sub(r"`([^`]*)`", r"\1", text)
        text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
        slug = re.sub(r"[^\w\- ]", "", text.lower()).replace(" ", "-")
        n = seen.get(slug, 0)
        seen[slug] = n + 1
        out.add(slug if n == 0 else f"{slug}-{n}")
    return out

broken = 0
for doc in DOCS:
    text = open(doc, encoding="utf8").read()
    stripped = re.sub(r"```.*?```", "", text, flags=re.S)
    for target in re.findall(r"\]\(([^)\s]+)\)", stripped):
        if re.match(r"^[a-z]+:", target):
            continue
        path, _, anchor = target.partition("#")
        resolved = os.path.normpath(os.path.join(os.path.dirname(doc), path)) if path else doc
        if not os.path.exists(resolved):
            print(f"BROKEN {doc}: {target} (no {resolved})"); broken += 1; continue
        if anchor and resolved.endswith(".md") and anchor not in slugs(resolved):
            print(f"BROKEN {doc}: {target} (no anchor #{anchor})"); broken += 1
    prose = re.sub(r"`[^`]*`", "", stripped)
    odd = sorted(set(re.findall(r"[^\x00-\x7f‐-‧ -ÿ←-⇿∀-⋿·™…→≤≥×✓✗€]", prose)))
    print(f"{doc}: links checked; unusual characters outside code: {''.join(odd) or 'none'}")
sys.exit(1 if broken else 0)
