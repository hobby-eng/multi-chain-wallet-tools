// Finds code copied from one place to another: the same run of at least MIN_TOKENS tokens in two
// places of the tools' sources (apps/*/src, apps/*/scripts, the launcher), the packages
// (packages/*/src and their Rust crates) and tooling/, whatever the white space, the line breaks
// and the comments. It reads the code with a small tokenizer of its own, so that it needs no
// package. Generated and vendored files (packages/*/generated, the synced MnemoCode source) are
// checked where they are written, not here.
//
// A copy is reported as "file A:lines = file B:lines": the code belongs in one function that both
// call (AGENTS.md, Object-oriented design and no repetition). A deliberate copy, such as a fast
// path or a worker that cannot import, says so in a comment that contains "deliberate copy" inside
// the copied lines or the three lines above them, with its reason; it is then not reported.
//
// It finds copies, not the same rule written in other words, such as `n < 1 || n > 2048` and
// `!(n >= 1 && n <= 2048)`, nor a constant written in many places: those still need the search
// before writing and a review. Import lists (`use` in Rust, `import …;` and `export { … }` in
// JavaScript) are left out: two files that use the same modules share no code. The recipe is
// MnemoCode's scripts/verify-no-copies.mjs, with mhfe's tokenizer for Rust beside the one for
// JavaScript.
//
//   node tooling/verify-no-copies.mjs [--tokens N]

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
/**
 * The shortest run of tokens that counts as a copy, about four to six lines of code: jscpd's
 * default, below which the same few lines of ordinary code meet by chance.
 */
const MIN_TOKENS = 50;
/** Endings of the files read. */
const SOURCE_ENDINGS = [".ts", ".mjs", ".js", ".rs"];
/** Folders read with everything below them, as globs of one `*` level from the root. */
const SOURCE_TREES = [
  "apps/*/src",
  "apps/*/scripts",
  "apps/key-derivation/launcher/src",
  "packages/*/src",
  "packages/*/types",
  "packages/*/rust/src",
];
/** Single files read beside the trees. */
const SOURCE_FILES = ["apps/key-derivation/launcher/build.rs"];
/** Folders read without their subfolders: tooling/fixtures holds data, not code. */
const SOURCE_FOLDERS = ["tooling"];
/** Tests repeat their fixtures on purpose; they are read by their own reviews, not here. */
const TEST_FILE = /\.test\.(?:ts|mjs)$/u;
/** Data, not code: lists that are long by nature and never repeat logic. */
const DATA_FILES = new Set([]);
/** The marker of a deliberate copy, in a comment in or just above the copied lines. */
const DELIBERATE = /deliberate copy/iu;
/** Lines above a copy in which its marker may stand. */
const MARKER_LINES_ABOVE = 3;

/**
 * The whole number that follows `name` among the arguments, or `fallback` without it. A value that
 * is missing or no positive whole number stops the check, which would otherwise compare nothing
 * and report no copy (MnemoCode AUD-012-ARC013).
 */
function option(name, fallback) {
  const at = process.argv.indexOf(name);
  if (at < 0) return fallback;
  const text = process.argv[at + 1];
  // Digits alone are not enough: a long run of them is Infinity as a number.
  const value = text !== undefined && /^[1-9][0-9]*$/u.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(value)) {
    console.error(`${name} needs a whole number of tokens from 1 up.`);
    process.exit(2);
  }
  return value;
}

function isSource(path) {
  return (
    SOURCE_ENDINGS.some((ending) => path.endsWith(ending)) &&
    !TEST_FILE.test(path) &&
    !DATA_FILES.has(path)
  );
}

/** The folders that `pattern` names, with one `*` standing for any folder name. */
function expand(pattern) {
  const [before, after] = pattern.split("/*/");
  if (after === undefined) return existsSync(join(root, pattern)) ? [pattern] : [];
  if (!existsSync(join(root, before))) return [];
  return readdirSync(join(root, before), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${before}/${entry.name}/${after}`)
    .filter((path) => existsSync(join(root, path)));
}

/** Every source file in `directory`, below it too when `deep`, by its path from the root. */
function sourceFiles(directory, deep) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return deep ? sourceFiles(path, deep) : [];
    return isSource(path) ? [path] : [];
  });
}

/** After these JavaScript tokens a slash starts a regular expression, not a division. */
const BEFORE_REGEX = new Set([
  ..."(,=:[!&|?{};+-*%<>~^",
  "return",
  "typeof",
  "case",
  "do",
  "else",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "yield",
  "await",
]);

/** A Rust character literal at the start of the text: 'a', '\n', '\'', '\u{1F600}'. */
const RUST_CHAR = /^'(?:\\(?:u\{[0-9a-fA-F_]+\}|x[0-9a-fA-F]{2}|.)|[^\\'\n])'/u;
/** A Rust raw string at the start of the text, with any prefix: r"…", r#"…"#, br##"…"##. */
const RUST_RAW = /^(?:b|c)?r(#*)"/u;

/**
 * The tokens of `text`, white space and comments left out, each with the line it starts on: words
 * and numbers whole, every string, character, template and regular expression as one token, and
 * every other character as a token of its own. Not a full parser of either language, but the same
 * code always gives the same tokens, which is all that finding copies needs. `rust` reads Rust:
 * nested block comments, raw and byte strings, and lifetimes told apart from characters.
 */
function tokensOf(text, rust) {
  const tokens = [];
  // The comments, each with the lines it spans: only a comment may mark a deliberate copy.
  const comments = [];
  let line = 1;
  let at = 0;
  const push = (from) => {
    const key = text.slice(from, at);
    tokens.push({ key, line });
    line += key.split("\n").length - 1;
  };
  /** Moves past a string whose opening quote is at `at`, as far as its closing `quote`. */
  const skipQuoted = (quote) => {
    at += 1;
    while (at < text.length && text[at] !== quote) at += text[at] === "\\" ? 2 : 1;
    at += 1;
  };
  while (at < text.length) {
    const char = text[at];
    const rest = text.slice(at, at + 16);
    if (char === "\n") {
      line += 1;
      at += 1;
    } else if (/\s/u.test(char)) at += 1;
    else if (text.startsWith("//", at)) {
      const from = at;
      while (at < text.length && text[at] !== "\n") at += 1;
      comments.push({ text: text.slice(from, at), first: line, last: line });
    } else if (text.startsWith("/*", at)) {
      const from = at;
      if (rust) {
        // Rust nests block comments.
        let depth = 0;
        while (at < text.length) {
          if (text.startsWith("/*", at)) {
            depth += 1;
            at += 2;
          } else if (text.startsWith("*/", at)) {
            depth -= 1;
            at += 2;
            if (depth === 0) break;
          } else at += 1;
        }
      } else {
        const close = text.indexOf("*/", at + 2);
        at = close < 0 ? text.length : close + 2;
      }
      const body = text.slice(from, at);
      const lines = body.split("\n").length - 1;
      comments.push({ text: body, first: line, last: line + lines });
      line += lines;
    } else if (rust && RUST_RAW.test(rest)) {
      const [opening, hashes] = RUST_RAW.exec(rest);
      const from = at;
      const close = text.indexOf(`"${hashes}`, at + opening.length);
      at = close < 0 ? text.length : close + 1 + hashes.length;
      push(from);
    } else if (rust && (rest.startsWith('b"') || rest.startsWith('c"'))) {
      const from = at;
      at += 1;
      skipQuoted('"');
      push(from);
    } else if (rust && rest.startsWith("b'") && RUST_CHAR.test(rest.slice(1))) {
      const from = at;
      at += 1 + RUST_CHAR.exec(rest.slice(1))[0].length;
      push(from);
    } else if (rust && char === "'") {
      // A character literal, or a lifetime or label: the quote and its name.
      const from = at;
      const literal = RUST_CHAR.exec(text.slice(at, at + 16));
      if (literal) at += literal[0].length;
      else {
        at += 1;
        while (at < text.length && /[\p{L}\p{N}_]/u.test(text[at])) at += 1;
      }
      push(from);
    } else if (/[\p{L}_$]/u.test(char)) {
      const from = at;
      while (at < text.length && /[\p{L}\p{N}_$]/u.test(text[at])) at += 1;
      push(from);
    } else if (/\d/u.test(char)) {
      const from = at;
      while (at < text.length && /[\w.]/u.test(text[at]) && !text.startsWith("..", at)) at += 1;
      push(from);
    } else if (char === '"' || (!rust && char === "'")) {
      const from = at;
      skipQuoted(char);
      push(from);
    } else if (!rust && char === "`") {
      // A template with its expressions, as far as the backtick that closes it.
      const from = at;
      at += 1;
      let depth = 0;
      while (at < text.length && !(text[at] === "`" && depth === 0)) {
        if (text[at] === "\\") at += 1;
        else if (text.startsWith("${", at)) depth += 1;
        else if (text[at] === "}" && depth > 0) depth -= 1;
        at += 1;
      }
      at += 1;
      push(from);
    } else if (
      !rust &&
      char === "/" &&
      (tokens.length === 0 || BEFORE_REGEX.has(tokens.at(-1).key))
    ) {
      const from = at;
      at += 1;
      let inClass = false;
      while (at < text.length && (text[at] !== "/" || inClass) && text[at] !== "\n") {
        if (text[at] === "\\") at += 1;
        else if (text[at] === "[") inClass = true;
        else if (text[at] === "]") inClass = false;
        at += 1;
      }
      at += 1;
      while (at < text.length && /[a-z]/u.test(text[at])) at += 1;
      push(from);
    } else {
      const from = at;
      at += 1;
      push(from);
    }
  }
  return { tokens, comments };
}

/** Tokens after which a statement starts. */
const STATEMENT_ENDS = new Set([";", "}"]);

/** Whether `token` is a string: the name of a module after `from`. */
function isString(token) {
  return token !== undefined && (token.key.startsWith('"') || token.key.startsWith("'"));
}

/** `index`, or the semicolon right after it: the last token of a statement. */
function withSemicolon(tokens, index) {
  return tokens[index + 1]?.key === ";" ? index + 1 : index;
}

/**
 * The last token of the JavaScript list of imports or exports that starts at `at`: the module's
 * name of `import "…"` or after `from`, or the brace that closes a local `export { … }`, with the
 * semicolon after it if there is one. Undefined for a list of no form known here, which then stays
 * as code: a list ended at the next semicolon would take the code after it when it has none
 * (MnemoCode's fix, found by mhfe).
 */
function listEnd(tokens, at) {
  if (isString(tokens[at + 1])) return withSemicolon(tokens, at + 1);
  let depth = 0;
  for (let index = at + 1; index < tokens.length; index += 1) {
    const { key } = tokens[index];
    if (key === "{") depth += 1;
    else if (key === "}") {
      depth -= 1;
      const local = tokens[at].key === "export" && tokens[index + 1]?.key !== "from";
      if (depth === 0 && local) return withSemicolon(tokens, index);
    } else if (depth === 0 && key === "from" && isString(tokens[index + 1]))
      return withSemicolon(tokens, index + 1);
    else if (depth === 0 && key === ";") return undefined;
  }
  return undefined;
}

/** The last token of Rust's `use …;`, which always ends with its semicolon. */
function useEnd(tokens, at) {
  const end = tokens.findIndex((token, index) => index > at && token.key === ";");
  return end < 0 ? undefined : end;
}

/**
 * `tokens` without the import lists: Rust's `use …;`, and JavaScript's `import … from "…"`,
 * `export { … }`, `export type { … }` and `export * …` where they start a statement. A dynamic
 * import(…) and import.meta are code and stay, as does an exported declaration.
 */
function withoutImportLists(tokens, rust) {
  const kept = [];
  // The last token of the list left out last: the next statement starts after it.
  let listEndedAt = -1;
  for (let at = 0; at < tokens.length; at += 1) {
    const { key } = tokens[at];
    const startsStatement =
      at === 0 || STATEMENT_ENDS.has(tokens[at - 1].key) || at - 1 === listEndedAt;
    const next = tokens[at + 1]?.key;
    const list = rust
      ? key === "use" || (key === "pub" && next === "use")
      : (key === "import" && next !== "(" && next !== ".") ||
        (key === "export" &&
          (next === "{" || next === "*" || (next === "type" && tokens[at + 2]?.key === "{")));
    const end = startsStatement && list ? (rust ? useEnd : listEnd)(tokens, at) : undefined;
    if (end !== undefined) {
      at = end;
      listEndedAt = end;
      continue;
    }
    kept.push(tokens[at]);
  }
  return kept;
}

/**
 * Whether a comment within lines `first` to `last`, or the few above, marks a deliberate copy. Text
 * in a string or anywhere else is no marker (MnemoCode AUD-012-ARC015).
 */
function deliberate(comments, first, last) {
  return comments.some(
    (comment) =>
      comment.last >= first - MARKER_LINES_ABOVE &&
      comment.first <= last &&
      DELIBERATE.test(comment.text),
  );
}

/** Test-only Rust modules are fixtures, just like the .test.ts files excluded above. */
function withoutRustTests(tokens) {
  const kept = [];
  for (let at = 0; at < tokens.length; at += 1) {
    const attribute = tokens
      .slice(at, at + 7)
      .map(({ key }) => key)
      .join(" ");
    let module = at + 7;
    if (tokens[module]?.key === "pub") module += 1;
    if (
      attribute === "# [ cfg ( test ) ]" &&
      tokens[module]?.key === "mod" &&
      tokens[module + 2]?.key === "{"
    ) {
      let depth = 1;
      let end = module + 3;
      while (end < tokens.length && depth > 0) {
        if (tokens[end].key === "{") depth += 1;
        else if (tokens[end].key === "}") depth -= 1;
        end += 1;
      }
      // An incomplete block is still inspected; malformed source must not hide a copy.
      if (depth === 0) {
        at = end - 1;
        continue;
      }
    }
    kept.push(tokens[at]);
  }
  return kept;
}

const minTokens = option("--tokens", MIN_TOKENS);
const paths = [
  ...SOURCE_TREES.flatMap(expand).flatMap((directory) => sourceFiles(directory, true)),
  ...SOURCE_FOLDERS.flatMap((directory) => sourceFiles(directory, false)),
  ...SOURCE_FILES.filter((path) => existsSync(join(root, path))),
];
const files = [...new Set(paths)].sort().map((path) => {
  const text = readFileSync(join(root, path), "utf8");
  const rust = path.endsWith(".rs");
  const { tokens, comments } = tokensOf(text, rust);
  return {
    path,
    comments,
    tokens: withoutImportLists(rust ? withoutRustTests(tokens) : tokens, rust),
  };
});

// Every window of minTokens tokens, by its text: where it occurs, as [file, first token].
const windows = new Map();
files.forEach((file, fileIndex) => {
  for (let start = 0; start + minTokens <= file.tokens.length; start += 1) {
    const key = file.tokens
      .slice(start, start + minTokens)
      .map((token) => token.key)
      .join("\u0000");
    const places = windows.get(key);
    if (places === undefined) windows.set(key, [[fileIndex, start]]);
    else places.push([fileIndex, start]);
  }
});

// Pairs of places of the same window, each copy against the first place, grown into the longest
// runs: consecutive windows that match at the same distance are one copy.
const runs = new Map();
for (const places of windows.values())
  places.forEach((first, index) => {
    for (const other of places.slice(index + 1)) {
      // Overlapping windows of one file are one run of repeated tokens, not a copy.
      if (first[0] === other[0] && other[1] - first[1] < minTokens) continue;
      const diagonal = `${first[0]}:${other[0]}:${other[1] - first[1]}`;
      const run = runs.get(diagonal) ?? [];
      run.push(first[1]);
      runs.set(diagonal, run);
    }
  });

// The copies, by their later place: a place that copies several others is one copy, against the
// earliest of them that no comment marks, so that three equal places are two copies. Places are
// found in the order of the files and of their tokens, so the first of a pair is the earlier.
const byLaterPlace = new Map();
for (const [diagonal, starts] of runs) {
  const [a, b, distance] = diagonal.split(":").map(Number);
  starts.sort((x, y) => x - y);
  for (let index = 0; index < starts.length;) {
    let end = index;
    while (end + 1 < starts.length && starts[end + 1] === starts[end] + 1) end += 1;
    const from = starts[index];
    const to = starts[end] + minTokens - 1;
    const fileA = files[a];
    const fileB = files[b];
    const lines = [fileA.tokens[from].line, fileA.tokens[to].line];
    const otherLines = [fileB.tokens[from + distance].line, fileB.tokens[to + distance].line];
    if (!deliberate(fileA.comments, ...lines) && !deliberate(fileB.comments, ...otherLines)) {
      const later = `${b}:${from + distance}:${to + distance}`;
      const known = byLaterPlace.get(later);
      if (known === undefined || a < known.file || (a === known.file && from < known.from))
        byLaterPlace.set(later, {
          a: fileA.path,
          lines,
          b: fileB.path,
          otherLines,
          tokens: to - from + 1,
          file: a,
          from,
        });
    }
    index = end + 1;
  }
}
const copies = [...byLaterPlace.values()];

copies.sort((x, y) => y.tokens - x.tokens);
for (const copy of copies)
  console.error(
    `${copy.a}:${copy.lines[0]}-${copy.lines[1]} = ${copy.b}:${copy.otherLines[0]}-${copy.otherLines[1]} (${copy.tokens} tokens)`,
  );
if (copies.length > 0) {
  console.error(
    `${copies.length} copies of ${minTokens} tokens or more: move each into one function that both places call, or mark a deliberate one (see the top of ${relative(root, fileURLToPath(import.meta.url))}).`,
  );
  process.exit(1);
}
console.log(`No copies of ${minTokens} tokens or more in ${files.length} source files.`);
