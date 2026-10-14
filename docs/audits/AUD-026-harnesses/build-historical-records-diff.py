"""AUD-026 build reviewer (CHECK-DOC-003): the working tree edits committed historical audit records.
AGENTS.md ("Report privacy") requires home-directory paths in records to read /home/user. This
harness compares each changed record with its HEAD version after normalizing such paths in the HEAD
text, and reports every remaining difference:

- JSON: parsed values are compared, so formatting alone is not a difference;
- Markdown: lines are compared after collapsing whitespace and Prettier table padding.

A timestamp moved to UTC shows as a difference and is listed for a reviewer to judge. Exit 1 when a
JSON record differs in anything but the normalization. Reads only; changes nothing.
Run: python3 docs/audits/AUD-026-harnesses/build-historical-records-diff.py
"""
import difflib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
USER = Path.home().name


def head(path):
    return subprocess.run(
        ["git", "show", f"HEAD:{path}"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout


def normalize(text):
    return text.replace(f"/home/{USER}/", "/home/user/").replace(f"/home/{USER}\"", "/home/user\"")


def walk(left, right, where, out):
    if type(left) is not type(right):
        out.append(f"{where}: {str(left)[:120]!r} -> {str(right)[:120]!r}")
    elif isinstance(left, dict):
        for key in sorted(set(left) | set(right)):
            if key not in left or key not in right:
                out.append(f"{where}/{key}: {'added' if key not in left else 'removed'}")
            else:
                walk(left[key], right[key], f"{where}/{key}", out)
    elif isinstance(left, list):
        if len(left) != len(right):
            out.append(f"{where}: list length {len(left)} -> {len(right)}")
        for index, (a, b) in enumerate(zip(left, right)):
            walk(a, b, f"{where}[{index}]", out)
    elif left != right:
        out.append(f"{where}: {str(left)[:160]!r} -> {str(right)[:160]!r}")


def normal_lines(text):
    lines = []
    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        line = re.sub(r"\s*\|\s*", "|", line)
        line = re.sub(r"\|-{3,}", "|---", line)
        if line:
            lines.append(line)
    return lines


changed = subprocess.run(
    ["git", "diff", "--name-only", "--", "docs/audits/"], cwd=ROOT, capture_output=True, text=True, check=True
).stdout.split()
json_failures = 0
for path in changed:
    if not re.search(r"AUD-\d+-[\d-]+\.(json|md)$", path):
        continue
    old = normalize(head(path))
    new = (ROOT / path).read_text()
    if path.endswith(".json"):
        differences = []
        walk(json.loads(old), json.loads(new), "", differences)
        json_failures += len(differences)
        print(f"{path}: {len(differences)} value difference(s) beyond the normalization")
        for line in differences[:12]:
            print(f"  {line}")
    else:
        diff = [
            line
            for line in difflib.unified_diff(normal_lines(old), normal_lines(new), lineterm="", n=0)
            if line[:1] in "+-" and not line.startswith(("+++", "---"))
        ]
        print(f"{path}: {len(diff)} changed normalized line(s) beyond the normalization")
        for line in diff[:8]:
            print(f"  {line[:220]}")
print(f"JSON value differences beyond the normalization: {json_failures}")
sys.exit(1 if json_failures else 0)
