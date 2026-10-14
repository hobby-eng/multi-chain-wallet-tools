"""Apply publication metadata and rebind document hashes without replaying an audit."""

import argparse
import ast
import base64
import copy
import datetime
import hashlib
import importlib.util
import json
import pathlib
import re
import sys
import uuid


class JsonStrings:
    """Locate explicit JSON string values so rebinding preserves formatter output."""

    def __init__(self, text):
        self._text = text
        self._decoder = json.JSONDecoder()
        self._spans = {}
        self._visit(0, ())

    def _skip(self, position):
        while position < len(self._text) and self._text[position].isspace():
            position += 1
        return position

    def _visit(self, position, path):
        position = self._skip(position)
        token = self._text[position]
        if token in "{[":
            is_object = token == "{"
            closing = "}" if is_object else "]"
            position = self._skip(position + 1)
            index = 0
            while self._text[position] != closing:
                if is_object:
                    key, position = self._decoder.raw_decode(self._text, position)
                    position = self._skip(position)
                    if self._text[position] != ":":
                        raise ValueError("Invalid JSON property separator")
                    position += 1
                else:
                    key = str(index)
                position = self._skip(self._visit(position, (*path, key)))
                index += 1
                if self._text[position] == ",":
                    position = self._skip(position + 1)
                elif self._text[position] != closing:
                    raise ValueError("Invalid JSON value separator")
            return position + 1
        value, end = self._decoder.raw_decode(self._text, position)
        if isinstance(value, str):
            self._spans[path] = (position, end)
        return end

    def replace(self, values):
        edits = [(self._spans[tuple(path)], json.dumps(value)) for path, value in values]
        text = self._text
        for (start, end), replacement in sorted(edits, reverse=True):
            text = text[:start] + replacement + text[end:]
        return text


class PrivacyDocuments:
    """Own the bounded document set, immutable provenance and dependency ordering."""

    REPOSITORIES = {"multi-chain-wallet-tools": 29, "dash-wallet-tools": 2}
    TIME_ZONE = "UTC (+00:00)"
    # Historical findings attribute /home/runner to upstream public CI, not this machine.
    PUBLIC_HOME_ACCOUNTS = {"user", "runner"}
    NOTE = (
        "Owner-authorized privacy-only publication metadata; no audit checks were rerun. "
        "Original instants, date precision, findings, counts, source and artifact hashes, "
        "and raw local evidence are retained. Date-only records gain no inferred clock value. "
        "Original document bindings remain recorded as historical provenance; current "
        "document bindings identify publication bytes only."
    )
    MARKDOWN_HEADING = "## Privacy-only publication provenance"
    INDEX_NOTE = (
        "Published machine-owner paths use `/home/user/...`; report time zone is explicitly "
        "UTC (+00:00). Historical records retain their original instants and date precision. "
        "Privacy-only metadata does not rerun checks or change findings, counts, source or "
        "artifact hashes. Each paired record retains its pre-edit document hashes and original "
        "document bindings as provenance; updated document bindings identify publication bytes "
        "only. Raw local evidence remains unchanged."
    )
    REPORT_HARNESS = "multi-chain-wallet-tools/docs/audits/AUD-029-harnesses/report.py"
    NEW_FILES = (
        "multi-chain-wallet-tools/docs/audits/AUD-030-harnesses/privacy.py",
        "multi-chain-wallet-tools/docs/audits/AUD-030-harnesses/privacy-README.md",
    )
    # This inventory is deliberately explicit: source, artifact and evidence hashes are not targets.
    DOCUMENT_BINDINGS = {
        "multi-chain-wallet-tools/docs/audits/AUD-026-2026-10-09.json": [
            (("remediation", "37", "ownerSha256"), "AUD-024-2026-10-08.md"),
            (("authorizedRemediation", "dispositions", "20", "ownerSha256"),
             "AUD-024-2026-10-08.md"),
            (("resumptionVerification", "historicalReportHashes",
              "docs/audits/AUD-027-2026-10-08.md"), "AUD-027-2026-10-08.md"),
            (("resumptionVerification", "historicalReportHashes",
              "docs/audits/AUD-027-2026-10-08.json"), "AUD-027-2026-10-08.json"),
        ],
        "multi-chain-wallet-tools/docs/audits/AUD-027-2026-10-08.json": [
            (("authorizedRemediation", "documentationCorrections", "0", "sha256"),
             "AUD-024-2026-10-08.md"),
        ],
        "multi-chain-wallet-tools/docs/audits/AUD-029-2026-10-12.json": [
            (("baselineReports", "AUD-028-2026-10-12.md"), "AUD-028-2026-10-12.md"),
            (("baselineReports", "AUD-028-2026-10-12.json"), "AUD-028-2026-10-12.json"),
            (("harnesses", "docs/audits/AUD-029-harnesses/report.py"),
             "AUD-029-harnesses/report.py"),
        ],
        "dash-wallet-tools/docs/audits/AUD-002-2026-10-12.json": [
            (("baselineReports", "AUD-001-2026-10-12.md"), "AUD-001-2026-10-12.md"),
            (("baselineReports", "AUD-001-2026-10-12.json"), "AUD-001-2026-10-12.json"),
        ],
    }

    def __init__(self):
        self._root = pathlib.Path(__file__).resolve().parents[4]
        # The reports were renamed after this harness ran (docs/audits/report-names): its retained
        # snapshot names them the old way, and its comparisons apply the rename's own edits first.
        rules = self._root / "multi-chain-wallet-tools/docs/audits/report-names/report_names.py"
        spec = importlib.util.spec_from_file_location("report_names", rules)
        self._names = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self._names)
        self._evidence = self._root / "multi-chain-wallet-tools/docs/audits/AUD-030-evidence/privacy"
        self._baseline_path = self._evidence / "before.json"
        self._records = []
        for repository, maximum in self.REPOSITORIES.items():
            directory = self._root / repository / "docs/audits"
            for number in range(1, maximum + 1):
                matches = sorted(directory.glob(f"AUD-{number:03d}-*.json"))
                if len(matches) != 1 or not matches[0].with_suffix(".md").is_file():
                    raise ValueError(f"Missing or ambiguous report pair: {repository} AUD-{number:03d}")
                self._records.append(matches[0].relative_to(self._root).as_posix())
        self._owned = sorted({
            *self._records,
            *(str(pathlib.PurePosixPath(name).with_suffix(".md")) for name in self._records),
            *(f"{repository}/docs/audits/README.md" for repository in self.REPOSITORIES),
            self.REPORT_HARNESS,
            *self.NEW_FILES,
        })

    @staticmethod
    def _hash(data):
        return hashlib.sha256(data).hexdigest()

    @staticmethod
    def _get(data, path):
        for key in path:
            data = data[int(key)] if isinstance(data, list) else data[key]
        return data

    @staticmethod
    def _set(data, path, value):
        owner = PrivacyDocuments._get(data, path[:-1])
        key = int(path[-1]) if isinstance(owner, list) else path[-1]
        owner[key] = value

    @staticmethod
    def _assignment(text, name):
        tree = ast.parse(text)
        owner = next(node for node in tree.body
                     if isinstance(node, ast.ClassDef) and node.name == "RemediationReport")
        matches = [node for node in owner.body if isinstance(node, ast.Assign)
                   and any(isinstance(target, ast.Name) and target.id == name
                           for target in node.targets)]
        if len(matches) != 1:
            raise ValueError(f"Missing or ambiguous harness assignment: {name}")
        return matches[0].value

    @staticmethod
    def _span(text, node):
        lines = text.splitlines(keepends=True)
        start = sum(len(line) for line in lines[:node.lineno - 1])
        end = sum(len(line) for line in lines[:node.end_lineno - 1])
        # AST columns are UTF-8 bytes; Python slicing uses character positions.
        start += len(lines[node.lineno - 1].encode()[:node.col_offset].decode())
        end += len(lines[node.end_lineno - 1].encode()[:node.end_col_offset].decode())
        return start, end

    def _read_baseline(self):
        raw = self._baseline_path.read_bytes()
        expected = self._baseline_path.with_suffix(".sha256").read_text().strip()
        if self._hash(raw) != expected:
            raise ValueError("Retained privacy baseline checksum mismatch")
        baseline = json.loads(raw)
        baseline["files"] = {self._names.renamed_path(name): entry
                             for name, entry in baseline["files"].items()}
        if sorted(baseline["files"]) != self._owned:
            raise ValueError("Owned file inventory changed")
        for name, entry in baseline["files"].items():
            if self._hash(base64.b64decode(entry["bytesBase64"])) != entry["sha256"]:
                raise ValueError(f"Retained document checksum mismatch: {name}")
        return baseline

    @staticmethod
    def _original(baseline, name):
        return base64.b64decode(baseline["files"][name]["bytesBase64"]).decode()

    def _migrated(self, baseline, name):
        """The retained bytes of `name` as the later report rename left them (report_names.py)."""
        repository, relative = name.split("/", 1)
        return self._names.migrated(repository, relative, self._original(baseline, name))

    def _bindings(self, name):
        directory = pathlib.PurePosixPath(name).parent
        return [(path, (directory / target).as_posix())
                for path, target in self.DOCUMENT_BINDINGS.get(name, [])]

    def _provenance(self, baseline, name):
        # Renamed keys, unchanged values: the bound hashes it holds predate the rename.
        original = json.loads(self._migrated(baseline, name))
        markdown = str(pathlib.PurePosixPath(name).with_suffix(".md"))
        return {
            "note": self.NOTE,
            "checksRerun": False,
            "originalDocuments": {
                "markdownSha256": baseline["files"][markdown]["sha256"],
                "jsonSha256": baseline["files"][name]["sha256"],
            },
            "originalDocumentBindings": [
                {"jsonPointer": "/" + "/".join(key.replace("~", "~0").replace("/", "~1")
                                               for key in path),
                 "target": target, "sha256": self._get(original, path)}
                for path, target in self._bindings(name)
            ],
        }

    def _scan(self, name, text):
        # Prose punctuation and generic /home/<user> examples are not account names.
        for home in re.findall(r"/home/([A-Za-z0-9_.-]+)", text):
            if home.rstrip(".") not in self.PUBLIC_HOME_ACCOUNTS:
                raise ValueError(f"Non-anonymized published home path: {name}")
        owner = self._root.parts[2] if self._root.parts[:2] == ("/", "home") else None
        if owner and re.search(rf"\b{re.escape(owner)}\b", text, re.IGNORECASE):
            raise ValueError(f"Machine-owner name in publication: {name}")
        for match in re.finditer(
            r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?"
            r"(?:Z|[+-]\d{2}:?\d{2})?", text
        ):
            if not match.group().endswith(("Z", "+00:00", "+0000")):
                raise ValueError(f"Naive or non-UTC full ISO time: {name}")

    def _check_content(self, baseline):
        for name in self._records:
            current = json.loads((self._root / name).read_text())
            if current.pop("reportTimeZone", None) != self.TIME_ZONE:
                raise ValueError(f"Missing report time zone: {name}")
            if current.pop("privacyProvenance", None) != self._provenance(baseline, name):
                raise ValueError(f"Privacy provenance changed: {name}")
            original = json.loads(self._migrated(baseline, name))
            for path, _ in self._bindings(name):
                if not re.fullmatch(r"[0-9a-f]{64}", self._get(current, path)):
                    raise ValueError(f"Invalid document hash: {name}")
                self._set(current, path, self._get(original, path))
            if current != original:
                raise ValueError(f"Substantive historical JSON data changed: {name}")
            markdown = (self._root / name).with_suffix(".md").read_text()
            if markdown.count(f"**Report time zone:** {self.TIME_ZONE}.") != 1:
                raise ValueError(f"Missing or duplicate Markdown time zone: {name}")
            if markdown.count(self.MARKDOWN_HEADING) != 1 or self.NOTE not in markdown:
                raise ValueError(f"Missing Markdown provenance: {name}")
            for digest in self._provenance(baseline, name)["originalDocuments"].values():
                if digest not in markdown:
                    raise ValueError(f"Missing original Markdown hash reference: {name}")
        original_harness = self._migrated(baseline, self.REPORT_HARNESS)
        harness = (self._root / self.REPORT_HARNESS).read_text()
        historical = self._assignment(harness, "HISTORICAL_BASELINES")
        if ast.literal_eval(historical) != ast.literal_eval(self._assignment(original_harness, "BASELINES")):
            raise ValueError("Original harness baseline anchors changed")
        anchors = ast.literal_eval(self._assignment(harness, "BASELINES"))
        old_anchors = ast.literal_eval(historical)
        if (anchors.keys() != old_anchors.keys()
                or any(anchors[key].keys() != old_anchors[key].keys() for key in old_anchors)):
            raise ValueError("Historical harness document target inventory changed")
        if any(not re.fullmatch(r"[0-9a-f]{64}", digest)
               for values in anchors.values() for digest in values.values()):
            raise ValueError("Invalid historical harness document anchor")
        current_tree, original_tree = ast.parse(harness), ast.parse(original_harness)
        for tree in (current_tree, original_tree):
            owner = next(node for node in tree.body
                         if isinstance(node, ast.ClassDef) and node.name == "RemediationReport")
            owner.body = [node for node in owner.body if not (
                isinstance(node, ast.Assign) and any(
                    isinstance(target, ast.Name) and target.id in ("BASELINES", "HISTORICAL_BASELINES")
                    for target in node.targets))]
        if ast.dump(current_tree) != ast.dump(original_tree):
            raise ValueError("Historical harness changed beyond document bindings")
        for name in self._owned:
            if name not in self.NEW_FILES:
                self._scan(name, (self._root / name).read_text())
        for repository in self.REPOSITORIES:
            for path in (self._root / repository / "docs/audits").glob("AUD-*-harnesses/**/*README.md"):
                self._scan(path.relative_to(self._root).as_posix(), path.read_text())

    def _graph(self):
        graph = {name: {target for _, target in self._bindings(name)} for name in self._records}
        graph[self.REPORT_HARNESS] = {
            f"{repository}/docs/audits/{filename}"
            for repository, filenames in ast.literal_eval(self._assignment(
                (self._root / self.REPORT_HARNESS).read_text(), "BASELINES")).items()
            for filename in filenames
        }
        visited, pending, ordered = set(), set(), []

        def visit(name):
            if name not in self._owned or not (self._root / name).is_file():
                raise ValueError(f"Missing or unauthorized binding target: {name}")
            if name in pending:
                raise ValueError(f"Document binding cycle or self-reference: {name}")
            if name in visited:
                return
            pending.add(name)
            for target in sorted(graph.get(name, set())):
                visit(target)
            pending.remove(name)
            visited.add(name)
            ordered.append(name)

        for name in sorted(graph):
            visit(name)
        return ordered

    def _harness_bindings(self, text):
        node = self._assignment(text, "BASELINES")
        if not isinstance(node, ast.Dict):
            raise ValueError("Harness baseline anchors must be a literal mapping")
        values = []
        for repository, filenames in zip(node.keys, node.values):
            for filename, value in zip(filenames.keys, filenames.values):
                target = f"{ast.literal_eval(repository)}/docs/audits/{ast.literal_eval(filename)}"
                values.append((value, target))
        return values

    def _commit_edits(self, stage, edits):
        run = {
            "stage": stage,
            "startedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "command": [sys.executable, "-B", *sys.argv],
            "cwd": str(pathlib.Path.cwd()),
            "harnessSha256": self._hash(pathlib.Path(__file__).read_bytes()),
            "edits": [],
        }
        for name, (before, after) in edits.items():
            run["edits"].append({"path": name, "beforeSha256": self._hash(before),
                                 "afterSha256": self._hash(after)})
        # Exclusive per-run records preserve every previous attempt and its planned mutations.
        record = self._evidence / f"{stage}-{uuid.uuid4().hex}.json"
        with record.open("x") as output:
            json.dump(run, output, indent=2)
            output.write("\n")
        for name, (before, after) in edits.items():
            path = self._root / name
            if path.read_bytes() != before:
                raise ValueError(f"Concurrent document edit: {name}; see retained planned mutations")
            path.write_bytes(after)
        result = {"stage": stage, "endedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  "mutationRecord": record.name, "mutationRecordSha256": self._hash(record.read_bytes()),
                  "files": {name: self._hash((self._root / name).read_bytes()) for name in self._owned}}
        with record.with_suffix(".completed.json").open("x") as output:
            json.dump(result, output, indent=2)
            output.write("\n")
        print(f"Privacy documents: {stage}; {len(edits)} files changed; evidence {record.name}")

    def apply(self):
        if self._baseline_path.exists():
            raise ValueError("Privacy metadata already initialized; use rebind or check")
        files = {name: (self._root / name).read_bytes() for name in self._owned}
        for name in self._records:
            data = json.loads(files[name])
            if "privacyProvenance" in data or "reportTimeZone" in data:
                raise ValueError(f"Existing privacy metadata requires manual review: {name}")
            self._scan(name, files[name].decode())
        baseline = {"capturedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "files": {name: {"sha256": self._hash(data),
                                     "bytesBase64": base64.b64encode(data).decode()}
                              for name, data in files.items()}}
        self._evidence.mkdir(parents=True, exist_ok=True)
        raw = (json.dumps(baseline, indent=2) + "\n").encode()
        with self._baseline_path.open("xb") as output:
            output.write(raw)
        with self._baseline_path.with_suffix(".sha256").open("x") as output:
            output.write(self._hash(raw) + "\n")
        edits = {}
        for name in self._records:
            data = json.loads(files[name])
            provenance = self._provenance(baseline, name)
            data.update(reportTimeZone=self.TIME_ZONE, privacyProvenance=provenance)
            edits[name] = (files[name], (json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode())
            markdown = str(pathlib.PurePosixPath(name).with_suffix(".md"))
            text = files[markdown].decode()
            if text.count("## Record metadata\n\n") != 1:
                raise ValueError(f"Missing or ambiguous Markdown metadata section: {markdown}")
            text = text.replace("## Record metadata\n\n", "## Record metadata\n\n"
                                f"- **Report time zone:** {self.TIME_ZONE}.\n", 1)
            text = text.rstrip() + f"\n\n{self.MARKDOWN_HEADING}\n\n{self.NOTE}\n\n"
            original = provenance["originalDocuments"]
            text += (f"Original document SHA-256: Markdown `{original['markdownSha256']}`; "
                     f"JSON `{original['jsonSha256']}`. These identify the retained pre-edit "
                     "publication bytes, not a new source snapshot.\n")
            edits[markdown] = (files[markdown], text.encode())
        for repository in self.REPOSITORIES:
            name = f"{repository}/docs/audits/README.md"
            link = "AUD-030-harnesses/privacy-README.md" if repository == "multi-chain-wallet-tools" else (
                "../../../multi-chain-wallet-tools/docs/audits/AUD-030-harnesses/privacy-README.md")
            text = files[name].decode().rstrip() + "\n\n## Publication privacy\n\n"
            text += self.INDEX_NOTE + f" See the [privacy metadata harness]({link}) for the "
            text += "repeatable rebind-only step after document formatting.\n"
            edits[name] = (files[name], text.encode())
        name = self.REPORT_HARNESS
        text = files[name].decode()
        node = self._assignment(text, "BASELINES")
        start, end = self._span(text, node)
        declaration = text.rfind("    BASELINES =", 0, start)
        if declaration < 0:
            raise ValueError("Cannot locate harness baseline declaration")
        historical = ("    # Audited anchors remain historical; BASELINES binds privacy-edited documents.\n"
                      "    HISTORICAL_BASELINES = " + text[start:end] + "\n\n")
        text = text[:declaration] + historical + text[declaration:]
        edits[name] = (files[name], text.encode())
        self._commit_edits("apply", edits)
        self._check_content(baseline)
        print("Substantive JSON unchanged; final document bindings await formatting and rebind.")

    def rebind(self):
        baseline = self._read_baseline()
        self._check_content(baseline)
        ordered = self._graph()
        planned = {name: (self._root / name).read_bytes() for name in self._owned}
        edits = {}
        for name in ordered:
            before = planned[name]
            text = before.decode()
            if name == self.REPORT_HARNESS:
                replacements = [(self._span(text, node), json.dumps(self._hash(planned[target])))
                                for node, target in self._harness_bindings(text)]
                for (start, end), value in sorted(replacements, reverse=True):
                    text = text[:start] + value + text[end:]
            elif self._bindings(name):
                values = [(path, self._hash(planned[target])) for path, target in self._bindings(name)]
                text = JsonStrings(text).replace(values)
            after = text.encode()
            if before != after:
                edits[name] = (before, after)
                planned[name] = after
        self._commit_edits("rebind", edits)
        self.check()

    def check(self):
        baseline = self._read_baseline()
        self._check_content(baseline)
        self._graph()
        for name in self._records:
            data = json.loads((self._root / name).read_text())
            for path, target in self._bindings(name):
                if self._get(data, path) != self._hash((self._root / target).read_bytes()):
                    raise ValueError(f"Stale document binding: {name} -> {target}")
        text = (self._root / self.REPORT_HARNESS).read_text()
        for node, target in self._harness_bindings(text):
            if ast.literal_eval(node) != self._hash((self._root / target).read_bytes()):
                raise ValueError(f"Stale historical harness document anchor: {target}")
        print(f"Privacy documents: {len(self._records)} pairs; substantive JSON unchanged; "
              "UTC metadata, provenance and document bindings pass. No audit checks rerun.")

    def check_content(self):
        self._check_content(self._read_baseline())
        self._graph()
        print(f"Privacy documents: {len(self._records)} pairs; substantive JSON unchanged; "
              "UTC metadata and retained provenance pass. Current bindings are not checked.")

    def format_paths(self):
        repository = self._root / "multi-chain-wallet-tools"
        for name in self._owned:
            if pathlib.PurePosixPath(name).suffix in (".md", ".json"):
                path = self._root / name
                if path.is_relative_to(repository):
                    print(path.relative_to(repository))
                else:
                    print("../" + name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=("apply", "rebind", "check", "check-content", "format-paths"))
    arguments = parser.parse_args()
    try:
        documents = PrivacyDocuments()
        getattr(documents, arguments.stage.replace("-", "_"))()
    except (ValueError, KeyError, OSError, StopIteration, SyntaxError) as error:
        print(f"Privacy documents: error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
