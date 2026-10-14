"""The rules of the report file name migration of 2026-10-14, in one place.

rename.py applies them; a historical validator that compares a document with bytes retained from
before the migration, such as AUD-030's privacy.py, applies them to those bytes with migrated()
before comparing, so that the migration's own edits are not taken for changes of substance.
"""

import hashlib
import json
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
RECORD = HERE / "record.json"
OLD_FILE = re.compile(r"^audit-(\d+)-(\d{4}-\d{2}-\d{2})\.(md|json)$")
# A report name in text: not part of a longer word, and not a template with {…} parts. In a JSON
# pointer a "/" is written "~1", so a name there follows "~1".
OLD_NAME = re.compile(r"(?:(?<=~1)|(?<![\w-]))audit-(\d{1,3})-(\d{4}-\d{2}-\d{2})(?![\w-])")
SHA256 = re.compile(r"\b[0-9a-f]{64}\b")
# Historical harness lines that build a report name from parts (file, old text, new text).
TEMPLATE_EDITS = [
    ("docs/audits/AUD-026-harnesses/build-audit-records.py",
     'AUDITS.glob("audit-[0-9][0-9]-*.json")', 'AUDITS.glob("AUD-[0-9][0-9][0-9]-*.json")'),
    ("docs/audits/AUD-026-harnesses/build-historical-records-diff.py",
     r'r"audit-\d+-[\d-]+\.(json|md)$"', r'r"AUD-\d+-[\d-]+\.(json|md)$"'),
    ("docs/audits/AUD-027-harnesses/validate.py",
     "f\"audit-27-{record['date']}\"", "f\"AUD-027-{record['date']}\""),
    ("docs/audits/AUD-027-harnesses/create-report.py",
     "f\"audit-27-{record['date']}\"", "f\"AUD-027-{record['date']}\""),
    ("docs/audits/AUD-028-harnesses/validate.py",
     'f"audit-{number:02d}-2026-10-12"', 'f"AUD-{number:03d}-2026-10-12"'),
    ("docs/audits/AUD-028-harnesses/report.py",
     "f\"audit-{record['auditNumber']:02d}-{record['date']}\"",
     "f\"AUD-{record['auditNumber']:03d}-{record['date']}\""),
    ("docs/audits/AUD-029-harnesses/validate.py",
     'f"audit-{number:02d}-{date}"', 'f"AUD-{number:03d}-{date}"'),
    ("docs/audits/AUD-029-harnesses/report.py",
     "f\"audit-{report['auditNumber']:02d}-{report['date']}\"",
     "f\"AUD-{report['auditNumber']:03d}-{report['date']}\""),
    ("docs/audits/AUD-030-harnesses/privacy.py",
     'f"audit-{number:02d}-*.json"', 'f"AUD-{number:03d}-*.json"'),
]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def renamed(text):
    """`text` with every report name audit-NN-<date> written AUD-0NN-<date>."""
    return OLD_NAME.sub(lambda m: f"AUD-{int(m.group(1)):03d}-{m.group(2)}", text)


def renamed_path(path):
    """A path whose file name is an old report name, with the new one; other paths unchanged."""
    path = pathlib.PurePosixPath(path)
    match = OLD_FILE.match(path.name)
    if match is None:
        return str(path)
    return str(path.with_name(f"AUD-{int(match.group(1)):03d}-{match.group(2)}.{match.group(3)}"))


def edited(name, text):
    """`text` of the repository file `name` after the migration's reference edits."""
    result = renamed(text)
    for file, old, new in TEMPLATE_EDITS:
        if name == file:
            if result.count(old) != 1:
                raise ValueError(f"{file}: expected one template line {old!r}.")
            result = result.replace(old, new)
    return result


def migrated(repository, name, text):
    """`text`, retained from before the migration for `name` (its current path) in `repository`,
    as the migration and every later recorded rebinding left it: the reference edits, then each
    rebound hash of that file in recorded order. A value the retained bytes do not hold, such as
    one a later edit had already replaced, is left as it is."""
    result = edited(name, text)
    for entry in json.loads(RECORD.read_text())["rebound"]:
        if entry["repository"] == repository and entry["file"] == name:
            result = result.replace(entry["from"], entry["to"])
    return result


def rebind(before, documents, stage):
    """Replaces, in every document, the bound hash of each changed document by its new hash, until
    nothing changes. `before` maps each document key to its hash before the edits and is updated;
    `documents` maps the keys to paths. Returns the rebound values for the record."""
    rebound = []
    for _ in range(64):
        current = {key: sha256(path.read_bytes()) for key, path in documents.items()}
        changes = {before[key]: (key, value) for key, value in current.items()
                   if key in before and before[key] != value}
        if not changes:
            return rebound
        for key, path in documents.items():
            try:
                text = path.read_bytes().decode("utf-8")
            except UnicodeDecodeError:
                continue
            new_text = SHA256.sub(lambda m: changes[m.group(0)][1] if m.group(0) in changes
                                  else m.group(0), text)
            if new_text != text:
                for value in sorted(set(SHA256.findall(text)) & changes.keys()):
                    rebound.append({"stage": stage, "repository": key[0], "file": key[1],
                                    "target": "/".join(changes[value][0]),
                                    "from": value, "to": changes[value][1]})
                path.write_bytes(new_text.encode("utf-8"))
        for key, new_value in changes.values():
            before[key] = new_value
    raise ValueError("Hash bindings did not settle: a cycle of documents binding each other.")
