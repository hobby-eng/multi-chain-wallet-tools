/** All-file baseline identity and syntax inventory; no reviewed project file is changed. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API } from "typescript/unstable/sync";
import { SyntaxKind as K } from "typescript/unstable/ast";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const output = resolve(root, "docs/audits/AUD-034-evidence");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const emit = (name, value) => writeFileSync(resolve(output, name), JSON.stringify(value, null, 2) + "\n");

/** A path partition assigns every byte to one reviewer; callers can inspect cross-scope edges. */
class AuditInventory {
  #rows = [];
  #operations = [];
  #signals = [];

  static owner(path) {
    if (/^apps\/key-derivation\//u.test(path)) return "deriver";
    if (/^apps\/(?:activity-viewer|discovery-scanner)\//u.test(path)) return "public";
    if (/^apps\/psbt-inspector\//u.test(path)) return "inspector";
    if (/^packages\/(?:crypto-core|coin-protocols|recovery-backup|wallet-recovery)\//u.test(path)) return "deriver";
    if (/^packages\/(?:dash-network|public-data-providers|network-boundary|secret-boundary|secret-vault)\//u.test(path)) return "public";
    if (/^packages\/(?:build-security|edition-profiles|verification|dash-shielded-wasm|recovery-(?:codex32|envelope|sskr|mhfe)-wasm|recovery-mnemocode)\//u.test(path)) return "build";
    if (/^(?:tooling\/|\.github\/|Dockerfile|\.dockerignore|launchers\/)/u.test(path)) return "build";
    return "coordinator";
  }

  capture() {
    const paths = [...new Set(readFileSync(resolve(output, "catalog-input.bin"), "utf8").split("\0"))]
      .filter((path) => path !== "" && existsSync(resolve(root, path)))
      .filter((path) => !/^docs\/audits\/AUD-034(?:-|\/)/u.test(path)).sort();
    for (const path of paths) {
      const bytes = readFileSync(resolve(root, path));
      const binary = bytes.subarray(0, 8192).includes(0);
      const historical = path.startsWith("docs/audits/");
      this.#rows.push({ path, bytes: bytes.length, sha256: sha(bytes), owner: historical ? "coordinator" : AuditInventory.owner(path),
        kind: historical ? "historical-audit" : /\/generated\/|packages\/recovery-mnemocode\/source\//u.test(path) ? "imported-or-generated" : /(?:^|\/)(?:tests?|fixtures|vectors)\/|\.test\./u.test(path) ? "test-or-fixture" : "source-or-document",
        binary, ...(binary ? {} : { lines: bytes.toString("utf8").split("\n").length }) });
    }
    const source = this.#rows.filter((row) => row.kind !== "historical-audit");
    const fingerprint = sha(source.map(({ path, sha256 }) => `${path}\0${sha256}\n`).join(""));
    emit("snapshot.json", { utc: new Date().toISOString(), fingerprint, algorithm: "SHA256(sorted path + NUL + file SHA256 + LF); historical audit records excluded from source fingerprint and separately inventoried", files: this.#rows });
    emit("scope-assignments.json", Object.fromEntries(["deriver", "public", "inspector", "build", "coordinator"].map((owner) => [owner, this.#rows.filter((row) => row.owner === owner).map(({ path }) => path)])));
    return { allFiles: this.#rows.length, sourceFiles: source.length, fingerprint };
  }

  syntax() {
    const files = this.#rows.filter(({ path, kind, binary }) => !binary && kind !== "historical-audit" && /\.(?:ts|mjs|js)$/u.test(path));
    const config = resolve(output, "tsconfig.json");
    writeFileSync(config, JSON.stringify({ extends: "../../../tsconfig.json", compilerOptions: { allowJs: true, checkJs: false }, files: files.map(({ path }) => `../../../${path}`), include: [] }));
    const api = new API({ cwd: root });
    const missed = [];
    try {
      const project = api.updateSnapshot({ openProjects: [config] }).getProject(config);
      for (const row of files) {
        const file = project.program.getSourceFile(resolve(root, row.path));
        if (!file) { missed.push(row.path); continue; }
        const at = (node) => ({ path: row.path, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 });
        const exported = (node) => node.modifiers?.some((modifier) => modifier.kind === K.ExportKeyword);
        const visit = (node) => {
          if (exported(node)) {
            const name = node.name?.getText(file) ?? node.getText(file).split("\n")[0].slice(0, 180);
            this.#operations.push({ ...at(node), name, kind: K[node.kind] ?? node.kind, owner: row.owner });
            if (node.kind === K.ClassDeclaration) {
              for (const member of node.members ?? []) {
                const name = member.name?.getText(file);
                if (name && !name.startsWith("#") && !member.modifiers?.some((m) => m.kind === K.PrivateKeyword))
                  this.#operations.push({ ...at(member), name: `${node.name?.getText(file)}.${name}`, kind: K[member.kind] ?? member.kind, owner: row.owner });
              }
            }
          }
          if ([K.NonNullExpression, K.AsExpression, K.AnyKeyword, K.ThrowStatement, K.PrivateKeyword, K.EnumDeclaration].includes(node.kind))
            this.#signals.push({ ...at(node), kind: K[node.kind] ?? node.kind, text: node.getText(file).slice(0, 180), imported: row.kind === "imported-or-generated" });
          node.forEachChild(visit);
        };
        visit(file);
      }
    } finally { api.close(); }
    emit("public-api-candidates.json", { method: "Syntax declarations including types/reexports and exported-class members; not proof that all are active runtime operations", parsedFiles: files.length - missed.length, missed, operations: this.#operations });
    emit("core-signals.json", this.#signals);
    if (missed.length) throw new Error(`Syntax inventory missed ${missed.length} files.`);
  }
}

mkdirSync(output, { recursive: true });
const audit = new AuditInventory();
const captured = audit.capture();
audit.syntax();
console.log(JSON.stringify(captured));
