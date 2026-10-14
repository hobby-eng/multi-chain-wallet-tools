// Audit-only mutations remain in memory. No project source, artifact or working copy is written.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { build, stop } from "esbuild";
import {
  chosenGoldenPhrase,
  nodeEnd,
  nodeStart,
  parseSource,
  read,
  root,
  sha256,
  walk,
} from "./source-fixtures.mjs";

const sourcePath = "packages/crypto-core/src/bip39-chosen-words.ts";
const original = read(sourcePath).toString("utf8");
const golden = await chosenGoldenPhrase();
const tree = await parseSource(original, sourcePath);

function mutate(functionName, condition, replacement, expectedCount) {
  const changes = [];
  walk(tree, (node) => {
    if (node.type !== "FunctionDeclaration" || node.id?.name !== functionName) return;
    assert.ok(node.body, `${functionName} has a body`);
    if (condition === undefined)
      changes.push({ start: nodeStart(node.body), end: nodeEnd(node.body), replacement });
    else {
      const visit = (part) => {
        if (
          part.type === "IfStatement" &&
          condition(original.slice(nodeStart(part.test), nodeEnd(part.test)))
        )
          changes.push({ start: nodeStart(part), end: nodeEnd(part), replacement });
      };
      walk(node.body, visit);
    }
  });
  assert.equal(changes.length, expectedCount, "the mutation targets the intended current AST");
  let changed = original;
  for (const { start, end, replacement: text } of changes.sort((a, b) => b.start - a.start))
    changed = changed.slice(0, start) + text + changed.slice(end);
  return changed;
}

const cases = [
  { name: "healthy", source: original, failure: undefined },
  {
    name: "no-op writer",
    source: mutate("writeBits", undefined, "{}", 1),
    failure: "entropy bit placement and neighboring bytes",
  },
  {
    name: "always-zero reader",
    source: mutate("readBits", undefined, "{ return 0; }", 1),
    failure: "independently placed entropy bits",
  },
  {
    name: "always-null predicate",
    source: mutate("phraseIndexes", undefined, "{ return null; }", 1),
    failure: "public zero-entropy word indexes and checksum",
  },
  {
    name: "ignored fixed-last checksum",
    source: mutate("phraseIndexes", (text) => text.includes("fixedLast !== last"), ";", 1),
    failure: "wrong final checksum is refused",
  },
  {
    name: "ignored exclusions",
    source: mutate("phraseIndexes", (text) => text.startsWith("p.neverUse.has("), ";", 2),
    failure: "excluded prefix word",
  },
  {
    name: "ignored anywhere requirement",
    source: mutate("phraseIndexes", (text) => text.includes("p.anywhere.every("), ";", 1),
    failure: "absent anywhere word",
  },
];

try {
  for (const [number, entry] of cases.entries()) {
    const compiled = await build({
      stdin: {
        contents: entry.source,
        sourcefile: sourcePath,
        resolveDir: resolve(root, "packages/crypto-core/src"),
        loader: "ts",
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      logLevel: "silent",
    });
    assert.equal(compiled.outputFiles.length, 1);
    const module = await import(
      `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}#${number}`
    );
    const started = performance.now();
    if (entry.failure === undefined) assert.equal(module.chosenWordsSelfTestPhrase(), golden);
    else
      assert.throws(
        () => module.chosenWordsSelfTestPhrase(),
        (error) =>
          error instanceof Error &&
          error.message === `BIP39 chosen-word self-test failed: ${entry.failure}.`,
        entry.name,
      );
    console.log(
      JSON.stringify({
        name: entry.name,
        passed: true,
        expectedFailure: entry.failure ?? null,
        milliseconds: performance.now() - started,
      }),
    );
  }
  console.log(
    JSON.stringify({
      sourcePath,
      sourceSha256: sha256(original),
      healthyExactPhrase: true,
      mutationsDetected: cases.length - 1,
      limitations:
        "Startup component only; no browser, live RNG, statistical proof or memory-erasure test.",
    }),
  );
} finally {
  stop();
}
