"""What a historical validator checks once the working tree has moved on from the reviewed snapshot.

A validator written for one audit compares the record with the live tree: the source manifest,
the hashes of fixed files, the artifacts in dist/. That holds only while nothing changes. In its
historical mode the validator uses this helper instead and compares the record with what the
record and its local evidence retained:

- the report pair, found by its audit number, whatever its date;
- the source manifest, which must reproduce the record's own source fingerprint;
- each bound file hash against that manifest;
- each reviewed artifact against an artifact snapshot retained in the evidence;
- every evidence file listed in the retained SHA256SUMS, which must still have its hash.

It changes no file. Command line: none; validators import it next to procedure_changes.py.
"""

import hashlib
import json
from pathlib import Path


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def report_paths(directory, number):
    """The JSON and Markdown report of audit `number` in `directory`, named AUD-NNN-<date>."""
    matches = sorted(Path(directory).glob(f"AUD-{number:03d}-*.json"))
    if len(matches) != 1 or not matches[0].with_suffix(".md").is_file():
        raise RuntimeError(f"Missing or ambiguous report pair for AUD-{number:03d}")
    return matches[0], matches[0].with_suffix(".md")


def retained_source(report):
    """The record's source manifest, checked against its fingerprint (AUD-028 capture.py form)."""
    files = report["snapshot"]["sourceManifest"]
    canonical = "".join(f"{item['sha256']}  {item['path']}\n" for item in files)
    if hashlib.sha256(canonical.encode()).hexdigest() != report["snapshot"]["sourceFingerprint"]:
        raise RuntimeError("Retained source manifest does not reproduce its fingerprint")
    return {"fingerprint": report["snapshot"]["sourceFingerprint"], "files": files}


def manifest_hash(source, path):
    """The hash the retained manifest gives `path`, or None when it lists no such file."""
    return next((item["sha256"] for item in source["files"] if item["path"] == path), None)


def retained_artifact(evidence, artifact):
    """Whether an artifact snapshot in `evidence` lists `artifact` with its hash."""
    for snapshot in Path(evidence).glob("*.artifacts.json"):
        for item in json.loads(snapshot.read_text()):
            if item["path"] == artifact["path"] and item["sha256"] == artifact["sha256"]:
                return True
    return False


def retained_evidence_intact(evidence):
    """Number of files the retained SHA256SUMS lists; raises if one is missing or changed."""
    sums = Path(evidence) / "SHA256SUMS"
    lines = [line for line in sums.read_text().splitlines() if line.strip()]
    for line in lines:
        expected, name = line.split("  ", 1)
        if sha256_file(Path(evidence) / name) != expected:
            raise RuntimeError(f"Retained evidence changed: {name}")
    return len(lines)
