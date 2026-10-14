"""AUD-026 build reviewer (CHECK-DOC-003): checks the committed audit records as a set.

- every docs/audits/audit-NN-*.json validates against docs/audit-report.schema.json and has no
  duplicate keys;
- the numbering is contiguous, each JSON has its Markdown twin, the index docs/audits/README.md
  links both, and the JSON auditId/auditNumber match the file name;
- the finding IDs of each JSON appear in its Markdown, and each finding ID carries its own audit's
  number;
- every docs/audits/AUD-NNN-harnesses folder of a finished audit has a README.md.

Prints every problem and exits 1 when there is one. Reads only; changes nothing.
Run: python3 docs/audits/AUD-026-harnesses/build-audit-records.py
"""
import json
import re
import sys
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parents[3]
AUDITS = ROOT / "docs/audits"
SCHEMA = json.loads((ROOT / "docs/audit-report.schema.json").read_text())


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key {key}")
        result[key] = value
    return result


problems = []
index = (AUDITS / "README.md").read_text()
records = sorted(AUDITS.glob("AUD-[0-9][0-9][0-9]-*.json"))
numbers = []
for path in records:
    number = int(path.name.split("-")[1])
    numbers.append(number)
    try:
        record = json.loads(path.read_text(), object_pairs_hook=unique_pairs)
    except ValueError as error:
        problems.append(f"{path.name}: {error}")
        continue
    errors = sorted(jsonschema.Draft202012Validator(SCHEMA).iter_errors(record), key=str)
    for error in errors[:5]:
        problems.append(f"{path.name}: schema: {'/'.join(map(str, error.path))}: {error.message[:160]}")
    if record.get("auditNumber") != number:
        problems.append(f"{path.name}: auditNumber {record.get('auditNumber')} != {number}")
    if record.get("auditId") != f"AUD-{number:03d}":
        problems.append(f"{path.name}: auditId {record.get('auditId')} != AUD-{number:03d}")
    markdown = path.with_suffix(".md")
    if not markdown.exists():
        problems.append(f"{path.name}: Markdown twin missing")
        continue
    text = markdown.read_text()
    for name in (path.name, markdown.name):
        if f"({name})" not in index:
            problems.append(f"README.md index does not link {name}")
    for finding in record.get("findings", []):
        identifier = finding.get("id", "")
        if identifier and identifier not in text:
            problems.append(f"{markdown.name}: finding {identifier} of the JSON is absent")
        if identifier and not identifier.startswith(f"AUD-{number:03d}-") and finding.get("legacyId") is None:
            problems.append(f"{path.name}: finding {identifier} does not carry AUD-{number:03d}")
expected = list(range(1, max(numbers) + 1)) if numbers else []
if numbers != expected:
    problems.append(f"audit numbering is not contiguous: {numbers}")
for folder in sorted(AUDITS.glob("AUD-[0-9][0-9][0-9]-harnesses")):
    number = int(folder.name[4:7])
    finished = any(n == number for n in numbers)
    if finished and not (folder / "README.md").exists():
        problems.append(f"{folder.name}: README.md missing for a published audit")
    if not finished:
        print(f"note: {folder.name} belongs to an audit without a published record yet")
print(f"Records checked: {len(records)} (AUD-001..AUD-{max(numbers):03d})")
for problem in problems:
    print(f"PROBLEM {problem}")
print(f"Problems: {len(problems)}")
sys.exit(1 if problems else 0)
