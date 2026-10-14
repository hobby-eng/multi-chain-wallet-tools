import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parsers } from "prettier/plugins/babel";

export const root = fileURLToPath(new URL("../../../../", import.meta.url));
export const read = (path) => readFileSync(new URL(path, new URL("../../../../", import.meta.url)));
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function stringValue(node) {
  if (["StringLiteral", "Literal"].includes(node.type) && typeof node.value === "string")
    return node.value;
  if (node.type === "BinaryExpression" && node.operator === "+")
    return stringValue(node.left) + stringValue(node.right);
  throw new Error("The complete chosen-word golden phrase is not a string literal expression.");
}

const parser = parsers["babel-ts"];
export const nodeStart = (node) => parser.locStart(node);
export const nodeEnd = (node) => parser.locEnd(node);
export const parseSource = (text, filepath) =>
  parser.parse(text, { filepath, parser: "babel-ts", originalText: text });

export function walk(node, visitor) {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visitor);
  } else if (node !== null && typeof node === "object" && typeof node.type === "string") {
    visitor(node);
    for (const [key, value] of Object.entries(node))
      if (!["comments", "tokens", "loc", "extra"].includes(key)) walk(value, visitor);
  }
}

export async function chosenGoldenPhrase() {
  const text = read("packages/verification/src/bip39-self-test.ts").toString("utf8");
  const tree = await parseSource(text, "bip39-self-test.ts");
  const found = [];
  const visit = (node) => {
    if (
      node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === "expectEqual" &&
      node.arguments.length === 3 &&
      ["StringLiteral", "Literal"].includes(node.arguments[0].type) &&
      node.arguments[0].value === "BIP39 phrase with chosen words"
    )
      found.push(stringValue(node.arguments[2]));
  };
  walk(tree, visit);
  assert.equal(found.length, 1, "one complete independent chosen-word KAT exists");
  assert.equal(found[0].split(" ").length, 24);
  return found[0];
}
