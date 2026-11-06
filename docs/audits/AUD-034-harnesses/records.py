"""Independent audit-record validation with Python's standard library; no project code runs."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/audits/AUD-034-evidence"


def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key: " + key)
        result[key] = value
    return result


def load(path):
    return json.loads(path.read_text(), object_pairs_hook=unique)


SCHEMA = load(ROOT / "docs/audit-report.schema.json")


def validate(value, schema):
    if "$ref" in schema:
        target = SCHEMA
        for part in schema["$ref"].removeprefix("#/").split("/"):
            target = target[part]
        validate(value, target)
    for item in schema.get("allOf", []):
        validate(value, item)
    if "const" in schema:
        assert value == schema["const"], "const"
    if "enum" in schema:
        assert value in schema["enum"], "enum"
    if "type" in schema:
        names = schema["type"]
        if isinstance(names, str):
            names = [names]
        types = {
            "object": isinstance(value, dict), "array": isinstance(value, list),
            "string": isinstance(value, str),
            "integer": isinstance(value, int) and not isinstance(value, bool),
            "boolean": isinstance(value, bool), "null": value is None,
        }
        assert any(types[name] for name in names), "type"
    if isinstance(value, dict):
        assert all(key in value for key in schema.get("required", [])), "required"
        for key, child in schema.get("properties", {}).items():
            if key in value:
                validate(value[key], child)
    if isinstance(value, list) and "items" in schema:
        for item in value:
            validate(item, schema["items"])
    if isinstance(value, int) and "minimum" in schema:
        assert value >= schema["minimum"], "minimum"
    if isinstance(value, str):
        if "pattern" in schema:
            assert re.search(schema["pattern"], value), "pattern"
        if "minLength" in schema:
            assert len(value) >= schema["minLength"], "minLength"


def main():
    outcomes = []
    records = sorted((ROOT / "docs/audits").glob("AUD-[0-9]*-20*.json"))
    for path in records:
        item = {"path": str(path.relative_to(ROOT)), "errors": []}
        try:
            record = load(path)
            validate(record, SCHEMA)
            markdown = path.with_suffix(".md")
            text = markdown.read_text()
            ids = [row["id"] for row in record["findings"]]
            assert len(ids) == len(set(ids)), "duplicate finding IDs"
            assert all(finding in text for finding in ids), "finding ID missing in Markdown"
            item.update(auditId=record["auditId"], findings=len(ids),
                        sha256=hashlib.sha256(path.read_bytes()).hexdigest())
        except (AssertionError, ValueError, OSError, KeyError) as cause:
            item["errors"].append(str(cause))
        outcomes.append(item)
    result = {"method": "Duplicate-key JSON parsing, exact schema keyword subset, paired Markdown and finding ID presence; no replay of historical checks", "records": outcomes}
    (OUT / "historical-record-validation.json").write_text(json.dumps(result, indent=2) + "\n")
    failed = [row for row in outcomes if row["errors"]]
    print(json.dumps({"records": len(outcomes), "failed": failed}))
    return bool(failed)


if __name__ == "__main__":
    raise SystemExit(main())
