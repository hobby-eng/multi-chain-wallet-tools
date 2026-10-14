"""Give every audit report of this repository and of dash-wallet-tools the workspace's one file
name form, AUD-NNN-<date>.md/.json (owner, 2026-10-14), and keep every reference and document
hash binding correct.

A documentation-only migration: no audit is replayed, and no finding, status, count, command,
source manifest or artifact hash changes meaning. The rules live in report_names.py:

1. References. In every text file of both repositories, each report name audit-NN-<date> becomes
   AUD-0NN-<date>; the same holds for mhfe's reports, which mhfe renamed alike. Nine historical
   harness lines that build a report name from parts are rewritten one by one (TEMPLATE_EDITS).
2. Files. Each docs/audits/audit-NN-<date>.md/.json is renamed: `git mv` where Git tracks it.
3. Hash bindings. A record that binds the SHA-256 of another document or harness under
   docs/audits gets that document's new hash, repeated until nothing changes. Hashes of files
   outside docs/audits are never rebound: in a record they describe the reviewed snapshot.
4. Provenance. record.json, next to this script, lists every rename, every edited file with its
   hash before and after, and every rebound value with the stage that rebound it.

Left alone: local evidence (*-evidence/), and procedure-changes.json, which quotes the old
standard's wording exactly so that procedure_changes.py can recover it.

Usage, from the multi-chain repository root:
  python3 -B docs/audits/report-names/rename.py plan    # prints what apply would do
  python3 -B docs/audits/report-names/rename.py apply   # once; refuses when record.json exists
  python3 -B docs/audits/report-names/rename.py check   # no old name left, links and JSON valid
A later edit of documents under docs/audits that records bind (a harness made to work with the
new names, for example) is recorded with:
  python3 -B docs/audits/report-names/rename.py snapshot <file>   # before the edit
  python3 -B docs/audits/report-names/rename.py rebind <file> <stage>   # after it
Exit status 1 on any error.
"""

import datetime
import json
import pathlib
import subprocess
import sys

from report_names import OLD_FILE, OLD_NAME, RECORD, edited, rebind, renamed_path, sha256

HERE = pathlib.Path(__file__).resolve().parent
MULTI = HERE.parents[2]
REPOSITORIES = {"multi-chain-wallet-tools": MULTI, "dash-wallet-tools": MULTI.parent / "dash-wallet-tools"}
SKIPPED_FILES = {"docs/audits/procedure-changes.json", "docs/audits/report-names/rename.py",
                 "docs/audits/report-names/report_names.py", "docs/audits/report-names/record.json"}


def git(repository, *args):
    return subprocess.check_output(["git", *args], cwd=repository).decode()


def visible_files(repository):
    """Git-visible files (tracked and untracked, not ignored), as repository-relative paths."""
    names = git(repository, "ls-files", "-co", "--exclude-standard", "-z").split("\0")
    return sorted(name for name in set(names) - {""} if (repository / name).is_file())


def text_of(path):
    try:
        return path.read_bytes().decode("utf-8")
    except UnicodeDecodeError:
        return None


def editable(name):
    return "-evidence/" not in name and "__pycache__" not in name and name not in SKIPPED_FILES


def texts():
    """Every editable text file: (repository name, repository, relative path, text)."""
    for repository_name, repository in REPOSITORIES.items():
        for name in visible_files(repository):
            if editable(name):
                text = text_of(repository / name)
                if text is not None:
                    yield repository_name, repository, name, text


def audit_documents():
    """Files under docs/audits of both repositories whose hashes records may bind."""
    return {(repository_name, name): repository / name
            for repository_name, repository in REPOSITORIES.items()
            for name in visible_files(repository)
            if name.startswith("docs/audits/") and editable(name)}


def renames():
    planned = []
    for repository_name, repository in REPOSITORIES.items():
        for path in sorted((repository / "docs/audits").iterdir()):
            if OLD_FILE.match(path.name):
                target = repository / renamed_path(str(path.relative_to(repository)))
                tracked = git(repository, "ls-files", str(path.relative_to(repository))) != ""
                planned.append((repository_name, repository, path, target, tracked))
    return planned


def plan():
    for repository_name, _, path, target, tracked in renames():
        print(f"rename {repository_name}: {path.name} -> {target.name}{' (git mv)' if tracked else ''}")
    edits = [(repository_name, name, len(OLD_NAME.findall(text)))
             for repository_name, _, name, text in texts() if edited(name, text) != text]
    for repository_name, name, count in edits:
        print(f"edit {repository_name}/{name}: {count} names")
    print(f"{len(renames())} renames, {len(edits)} edited files.")
    return 0


def apply():
    if RECORD.exists():
        raise SystemExit("record.json exists: the migration was applied already.")
    started = datetime.datetime.now(datetime.UTC).isoformat()
    before = {key: sha256(path.read_bytes()) for key, path in audit_documents().items()}
    edited_files = {}
    for repository_name, repository, name, text in texts():
        new = edited(name, text)
        if new != text:
            (repository / name).write_bytes(new.encode("utf-8"))
            edited_files[(repository_name, name)] = sha256(text.encode("utf-8"))
    renamed = []
    for repository_name, repository, path, target, tracked in renames():
        if target.exists():
            raise SystemExit(f"{target} exists already.")
        old_name, new_name = str(path.relative_to(repository)), str(target.relative_to(repository))
        if tracked:
            git(repository, "mv", old_name, new_name)
        else:
            path.rename(target)
        renamed.append({"repository": repository_name, "from": old_name, "to": new_name,
                        "gitTracked": tracked})
        for table in (before, edited_files):
            if (repository_name, old_name) in table:
                table[(repository_name, new_name)] = table.pop((repository_name, old_name))
    rebound = rebind(before, audit_documents(), "migration")
    files = []
    for repository_name, repository, name, _ in sorted(texts(), key=lambda t: (t[0], t[2])):
        old = edited_files.get((repository_name, name))
        new = sha256((repository / name).read_bytes())
        if old is not None and old != new:
            files.append({"stage": "migration", "repository": repository_name, "path": name,
                          "sha256Before": old, "sha256After": new})
    RECORD.write_text(json.dumps({
        "description": "Report file names AUD-NNN-<date> (owner, 2026-10-14): a documentation-only "
                       "migration. No audit was replayed; findings, statuses, counts, commands, "
                       "source manifests and artifact hashes keep their meaning. sha256Before is "
                       "the publication before this migration; rebound lists the document "
                       "bindings that now name the new bytes.",
        "appliedAtUtc": started,
        "renamed": renamed,
        "files": files,
        "rebound": rebound,
    }, indent=2) + "\n")
    print(f"Renamed {len(renamed)} files, edited {len(files)} files, rebound {len(rebound)} values.")


def snapshot(output):
    hashes = {f"{repository}\t{name}": sha256(path.read_bytes())
              for (repository, name), path in audit_documents().items()}
    pathlib.Path(output).write_text(json.dumps(hashes, indent=2) + "\n")
    print(f"{len(hashes)} document hashes saved.")


def rebind_later(snapshot_file, stage):
    """Records a later edit: rebinds from a snapshot taken before it, then appends to record.json."""
    saved = json.loads(pathlib.Path(snapshot_file).read_text())
    before = {tuple(key.split("\t")): value for key, value in saved.items()}
    record = json.loads(RECORD.read_text())
    if any(entry.get("stage") == stage for entry in record["files"] + record["rebound"]):
        raise SystemExit(f"Stage {stage} is recorded already.")
    edited_files = {key: value for key, value in before.items()}
    documents = audit_documents()
    rebound = rebind(before, documents, stage)
    files = [{"stage": stage, "repository": key[0], "path": key[1], "sha256Before": old,
              "sha256After": sha256(documents[key].read_bytes())}
             for key, old in sorted(edited_files.items())
             if key in documents and sha256(documents[key].read_bytes()) != old]
    record["files"] += files
    record["rebound"] += rebound
    RECORD.write_text(json.dumps(record, indent=2) + "\n")
    print(f"Stage {stage}: {len(files)} files changed, {len(rebound)} values rebound.")


def check():
    problems = []
    for repository_name, repository, name, text in texts():
        for match in OLD_NAME.finditer(text):
            problems.append(f"{repository_name}/{name}: old report name {match.group(0)}")
        if name.endswith(".json") and name.startswith("docs/audits/"):
            try:
                json.loads(text)
            except json.JSONDecodeError as error:
                problems.append(f"{repository_name}/{name}: invalid JSON ({error})")
    for repository_name, repository in REPOSITORIES.items():
        for path in (repository / "docs/audits").iterdir():
            if OLD_FILE.match(path.name):
                problems.append(f"{repository_name}: {path.name} keeps its old name")
    for problem in problems:
        print(problem)
    print(f"{len(problems)} problems.")
    return 1 if problems else 0


def main():
    command, *arguments = sys.argv[1:] or [""]
    if command == "plan":
        return plan()
    if command == "apply":
        apply()
        return check()
    if command == "check":
        return check()
    if command == "snapshot" and len(arguments) == 1:
        snapshot(arguments[0])
        return 0
    if command == "rebind" and len(arguments) == 2:
        rebind_later(*arguments)
        return check()
    raise SystemExit("Usage: rename.py plan|apply|check|snapshot <file>|rebind <file> <stage>")


if __name__ == "__main__":
    raise SystemExit(main())
