import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API } from "typescript/unstable/sync";
import * as ts from "typescript/unstable/ast";
import { beforeAll, describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const productionRoots = ["apps", "packages", "tooling"];

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (
      entry.isDirectory() &&
      !["node_modules", "dist", "test-results", "fixtures"].includes(entry.name)
    )
      return sourceFiles(path);
    return entry.isFile() &&
      /\.(?:ts|mjs)$/u.test(entry.name) &&
      !/\.test\.(?:ts|mjs)$/u.test(entry.name)
      ? [path]
      : [];
  });
}

function packageOwner(path) {
  return /^packages\/([^/]+)\//u.exec(path)?.[1];
}

function isRuntimeSource(path) {
  return (
    /^apps\/[^/]+\/src\//u.test(path) || /^packages\/[^/]+\/(?:src|source|generated)\//u.test(path)
  );
}

function moduleReferences(sourceFile) {
  const references = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier !== undefined) references.push(node.moduleSpecifier);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      references.push(node.arguments[0]);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      references.push(node.argument.literal);
    } else if (ts.isExternalModuleReference(node)) {
      references.push(node.expression);
    }
    node.forEachChild(visit);
  }
  visit(sourceFile);
  return references;
}

/** Keeps parser and compiler-resolved edges together so every boundary sees the same graph. */
class ModuleBoundaryGraph {
  #root;
  #edges = new Map();

  constructor(paths, cwd) {
    this.#root = cwd;
    const config = JSON.parse(readFileSync(join(cwd, "tsconfig.json"), "utf8"));
    const api = new API({ cwd });
    try {
      const snapshot = api.updateSnapshot({
        openProjects: [join(cwd, "tsconfig.json")],
        openFiles: paths,
      });
      try {
        for (const file of paths) {
          const project = snapshot.getDefaultProjectForFile(file);
          const sourceFile = project?.program.getSourceFile(file);
          if (sourceFile === undefined) throw new Error(`TypeScript could not parse ${file}.`);
          if (project.program.getSyntacticDiagnostics(file).length !== 0)
            throw new Error(`Invalid syntax in module-boundary source ${file}.`);
          const edges = [];
          for (const reference of moduleReferences(sourceFile)) {
            if (
              reference === undefined ||
              !(ts.isStringLiteral(reference) || ts.isNoSubstitutionTemplateLiteral(reference))
            ) {
              // Node build/verification scripts load controlled temporary outputs. Runtime
              // sources, including vendored/generated packages, must have resolvable edges.
              if (isRuntimeSource(this.#relative(file)))
                throw new Error(`Unresolved dynamic import in module-boundary source ${file}.`);
              continue;
            }
            const specifier = reference.text;
            const symbol = project.checker.getSymbolAtLocation(reference);
            const target = symbol?.declarations
              .map((handle) => handle.resolve(project))
              .find((node) => node !== undefined && ts.isSourceFile(node))?.fileName;
            // The compiler does not resolve binary assets. Keep their configured alias edges;
            // source-code edges always use the compiler's module resolution above.
            const assetTarget = /\.(?:wasm|json|png|jpg|svg|ttf)$/u.test(specifier)
              ? this.#assetTarget(file, specifier, config.compilerOptions.paths ?? {})
              : undefined;
            const resolvedTarget = assetTarget ?? target;
            if (
              resolvedTarget === undefined &&
              (specifier.startsWith(".") || isAbsolute(specifier) || specifier.startsWith("@ckd/"))
            ) {
              throw new Error(`Unresolved module-boundary import: ${file} -> ${specifier}`);
            }
            edges.push({ specifier, target: resolvedTarget });
          }
          this.#edges.set(file, edges);
        }
      } finally {
        snapshot.dispose();
      }
    } finally {
      api.close();
    }
  }

  dependencies(file) {
    return this.#edges.get(file) ?? [];
  }

  applicationViolations() {
    const violations = [];
    for (const [file, edges] of this.#edges) {
      const source = this.#relative(file);
      for (const { specifier, target } of edges) {
        const destination = target === undefined ? "" : this.#relative(target);
        if (
          destination.startsWith("apps/") &&
          (source.startsWith("packages/") ||
            (source.startsWith("apps/") && destination.split("/")[1] !== source.split("/")[1]))
        )
          violations.push(`${source} -> ${specifier}`);
      }
    }
    return violations;
  }

  assertAcyclic() {
    const graph = new Map();
    for (const [file, dependencies] of this.#edges) {
      const owner = packageOwner(this.#relative(file));
      if (owner === undefined) continue;
      const edges = graph.get(owner) ?? new Set();
      for (const { target } of dependencies) {
        const destination = target === undefined ? undefined : packageOwner(this.#relative(target));
        if (destination !== undefined && destination !== owner) edges.add(destination);
      }
      graph.set(owner, edges);
    }
    const visiting = new Set();
    const visited = new Set();
    const visit = (node, path) => {
      if (visiting.has(node)) throw new Error("Package cycle: " + [...path, node].join(" -> "));
      if (visited.has(node)) return;
      visiting.add(node);
      for (const next of graph.get(node) ?? []) visit(next, [...path, node]);
      visiting.delete(node);
      visited.add(node);
    };
    for (const node of graph.keys()) visit(node, []);
  }

  #relative(file) {
    return relative(this.#root, file).replaceAll("\\", "/");
  }

  #assetTarget(file, specifier, paths) {
    if (specifier.startsWith(".") || isAbsolute(specifier))
      return resolve(dirname(file), specifier);
    for (const [alias, targets] of Object.entries(paths)) {
      const [prefix, suffix] = alias.split("*");
      if (suffix === undefined) {
        if (specifier === alias) return resolve(this.#root, targets[0]);
      } else if (specifier.startsWith(prefix) && specifier.endsWith(suffix)) {
        const matched = specifier.slice(prefix.length, specifier.length - suffix.length);
        return resolve(this.#root, targets[0].replace("*", matched));
      }
    }
    return undefined;
  }
}

describe("module boundaries", () => {
  const files = productionRoots.flatMap((directory) => sourceFiles(join(root, directory)));
  let graph;
  beforeAll(() => {
    graph = new ModuleBoundaryGraph(files, root);
  });

  it("keeps applications and packages pointing inward", () => {
    expect(graph.applicationViolations()).toEqual([]);
  });

  it("keeps shared-package aliases acyclic", () => {
    expect(() => graph.assertAcyclic()).not.toThrow();
  });

  it("keeps public-address Activity hosts independent of Dash runtimes", () => {
    const offenders = [
      "apps/activity-viewer/src/public-address-view.ts",
      "apps/activity-viewer/src/external-activity.ts",
    ].filter((path) =>
      graph
        .dependencies(join(root, path))
        .some(({ target }) => target?.includes("/packages/dash-network/")),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps network-boundary independent of provider and secret implementations", () => {
    const forbidden = new Set(["public-data-providers", "secret-boundary"]);
    const offenders = files
      .filter((file) => packageOwner(relative(root, file)) === "network-boundary")
      .filter((file) =>
        graph
          .dependencies(file)
          .some(({ target }) =>
            forbidden.has(target === undefined ? undefined : packageOwner(relative(root, target))),
          ),
      );
    expect(offenders.map((file) => relative(root, file))).toEqual([]);
  });

  it("retains the valid dynamic Dash Orchard runtime edge", () => {
    const file = join(root, "packages/coin-protocols/src/coins/dash/runtime.ts");
    expect(graph.dependencies(file)).toContainEqual({
      specifier: "./shielded.js",
      target: join(root, "packages/coin-protocols/src/coins/dash/shielded.ts"),
    });
  });

  it("allows the reviewed Node verification loader without executing it", () => {
    const file = join(root, "apps/discovery-scanner/scripts/verify-shielded-stream.mjs");
    expect(graph.dependencies(file).map(({ specifier }) => specifier)).toContain("esbuild");
  });
});

describe("module-boundary parser regressions", () => {
  const cwd = join(root, "tooling/fixtures/module-boundaries");
  const fixture = (path) => join(cwd, path);
  const nonliteralRuntime = [
    "apps/discovery-scanner/src/nonliteral-runtime.ts",
    "packages/alpha/src/nonliteral-runtime.ts",
    "packages/alpha/source/nonliteral-runtime.ts",
  ];
  let graph;
  beforeAll(() => {
    // These deliberate rejection fixtures are analyzed separately; none is a product exclusion.
    const rejected = new Set(nonliteralRuntime.map(fixture));
    graph = new ModuleBoundaryGraph(
      [...sourceFiles(join(cwd, "apps")), ...sourceFiles(join(cwd, "packages"))].filter(
        (file) => !rejected.has(file),
      ),
      cwd,
    );
  });

  it("resolves static, re-exported, dynamic and aliased cross-application edges", () => {
    const violations = graph.applicationViolations();
    expect(violations).toHaveLength(5);
    for (const name of ["static", "re-export", "dynamic", "alias"])
      expect(violations.some((value) => value.startsWith(`apps/alpha/${name}.ts ->`))).toBe(true);
    expect(violations).toContain("packages/alpha/app-edge.ts -> ../../apps/beta/entry.js");
  });

  it("includes dynamic and aliased edges in package-cycle rejection", () => {
    expect(() => graph.assertAcyclic()).toThrow(/Package cycle: alpha -> beta -> alpha/u);
  });

  it("ignores import-like comments and strings and permits same-application imports", () => {
    expect(graph.dependencies(fixture("apps/beta/entry.ts"))).toEqual([]);
    expect(graph.dependencies(fixture("apps/alpha/local.ts"))).toEqual([
      { specifier: "./static.js", target: fixture("apps/alpha/static.ts") },
    ]);
  });

  it("allows a controlled temporary-module import at the verification script path", () => {
    const file = fixture("apps/discovery-scanner/scripts/verify-shielded-stream.mjs");
    expect(graph.dependencies(file).map(({ specifier }) => specifier)).toEqual(["node:url"]);
  });

  it.each(nonliteralRuntime)("rejects a nonliteral import in runtime source %s", (path) => {
    expect(() => new ModuleBoundaryGraph([fixture(path)], cwd)).toThrow(
      /Unresolved dynamic import in module-boundary source/u,
    );
  });
});
