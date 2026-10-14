# AUD-023 build reviewer harness: static checks of the two release workflows (read only).
#
#   python3 docs/audits/AUD-023-harnesses/build-release-workflows.py \
#     ../dash-wallet-tools/.github/workflows/release.yml \
#     .github/workflows/release.yml
#
# For each workflow it checks AUD-022-SEC003 and AUD-022-BLD002:
#   - the workflow default is contents: read and only the publish job has write, OIDC and
#     attestation permissions;
#   - no job with write permissions installs or builds dependencies (pnpm/npm/cargo/docker/
#     playwright/build scripts), and the publish job imports no package;
#   - the publish job needs the launcher start-up job, which runs
#     tooling/verify-key-derivation-launcher.mjs on Linux, Windows and macOS runners;
#   - for the Dash workflow, the publish job's `if:` expression, evaluated for every combination
#     of upstream results, publishes only when the launcher checks passed (or the release has no
#     executables and both launcher jobs were skipped).
# It then mutates each workflow in memory (launchers dropped from publish.needs, write permission
# moved to the workflow default, a dependency install added to publish) and requires every
# mutation to be refused, so that the checks can fail. Exits 1 on any failure.
import copy
import itertools
import re
import sys

import yaml

WRITE_SCOPES = {"contents", "id-token", "attestations", "packages", "actions", "deployments"}
DEPENDENCY_COMMAND = re.compile(
    r"\b(pnpm\s+install|npm\s+(?:ci|install)|cargo\s|docker\s|playwright\s+install|"
    r"build-reproducible\.sh|build-launchers-reproducible\.mjs|build-key-derivation-launchers\.mjs)"
)


def has_write(permissions):
    if permissions in ("write-all",):
        return True
    if not isinstance(permissions, dict):
        return False
    return any(value == "write" for key, value in permissions.items())


def job_commands(job):
    return "\n".join(step.get("run", "") for step in job.get("steps", []))


def evaluate_if(expression, results, launchers_output):
    """Evaluates the Dash publish condition, a GitHub expression, for given upstream results."""
    text = expression.replace("always()", "True").replace("&&", " and ").replace("||", " or ")
    text = text.replace("needs.release.outputs.launchers", repr(launchers_output))
    for job, result in results.items():
        text = text.replace(f"needs.{job}.result", repr(result))
    if "needs." in text:
        raise ValueError(f"unhandled reference in {text}")
    return eval(text, {"__builtins__": {}}, {"True": True, "False": False})  # noqa: S307


def check(workflow, label, dash):
    problems = []
    if workflow.get("permissions") != {"contents": "read"}:
        problems.append(f"{label}: workflow default permissions are {workflow.get('permissions')}")
    jobs = workflow["jobs"]
    for name, job in jobs.items():
        writes = has_write(job.get("permissions"))
        if name == "publish":
            if job.get("permissions") != {
                "contents": "write",
                "id-token": "write",
                "attestations": "write",
            }:
                problems.append(f"{label}: publish permissions are {job.get('permissions')}")
            if DEPENDENCY_COMMAND.search(job_commands(job)):
                problems.append(f"{label}: publish runs a dependency install or build")
        elif writes:
            problems.append(f"{label}: job {name} has write permissions {job.get('permissions')}")
    publish = jobs.get("publish", {})
    needs = publish.get("needs", [])
    needs = [needs] if isinstance(needs, str) else needs
    if "launchers" not in needs:
        problems.append(f"{label}: publish does not need the launchers job")
    launchers = jobs.get("launchers")
    if launchers is None:
        problems.append(f"{label}: no launchers job")
    else:
        if "verify-key-derivation-launcher.mjs" not in job_commands(launchers):
            problems.append(f"{label}: launchers job runs no launcher verifier")
        if dash and "--profile dash-community" not in job_commands(launchers):
            problems.append(f"{label}: launchers job does not check the Dash Community profile")
        oses = launchers.get("strategy", {}).get("matrix", {}).get("os", [])
        for family in ("ubuntu", "windows", "macos"):
            if not any(str(os).startswith(family) for os in oses):
                problems.append(f"{label}: launchers job has no {family} runner")
    if dash:
        expression = str(publish.get("if", ""))
        results = ("success", "failure", "cancelled", "skipped")
        for release, macos, launch, output in itertools.product(
            results, results, results, ("true", "false")
        ):
            outcome = {"release": release, "macos": macos, "launchers": launch}
            published = evaluate_if(expression, outcome, output)
            allowed = release == "success" and (
                (output == "true" and macos == "success" and launch == "success")
                or (output == "false" and macos == "skipped" and launch == "skipped")
            )
            if published != allowed:
                problems.append(f"{label}: publish if gives {published} for {outcome}, launchers={output}")
    return problems


def mutations(workflow, dash):
    dropped = copy.deepcopy(workflow)
    needs = dropped["jobs"]["publish"]["needs"]
    dropped["jobs"]["publish"]["needs"] = [n for n in needs if n != "launchers"]
    yield "launchers dropped from publish.needs", dropped
    widened = copy.deepcopy(workflow)
    widened["permissions"] = {"contents": "write", "id-token": "write"}
    yield "write permission as workflow default", widened
    installing = copy.deepcopy(workflow)
    installing["jobs"]["publish"]["steps"].append({"run": "pnpm install --frozen-lockfile"})
    yield "dependency install in publish", installing
    if dash:
        loose = copy.deepcopy(workflow)
        loose["jobs"]["publish"]["if"] = (
            "always() && needs.release.result == 'success' && "
            "(needs.macos.result == 'success' || needs.macos.result == 'skipped')"
        )
        yield "AUD-022 publish condition (launchers ignored)", loose


def main(paths):
    failures = 0
    for path in paths:
        dash = "dash-wallet-tools" in path
        label = "dash" if dash else "canonical"
        workflow = yaml.load(open(path, encoding="utf8"), Loader=yaml.BaseLoader)
        problems = check(workflow, label, dash)
        for problem in problems:
            print(f"FAIL {problem}")
        failures += len(problems)
        print(f"{label}: {path}: {'passed' if not problems else f'{len(problems)} problem(s)'}")
        for name, mutated in mutations(workflow, dash):
            refused = len(check(mutated, label, dash)) > 0
            print(f"  mutation '{name}': {'refused' if refused else 'NOT REFUSED'}")
            failures += 0 if refused else 1
    sys.exit(1 if failures else 0)


main(sys.argv[1:])
