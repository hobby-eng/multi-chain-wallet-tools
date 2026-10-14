// Absolute paths of the computer a build ran on, which a WebAssembly module carries in its panic
// locations unless its build remaps them (rustc --remap-path-prefix): they name the builder's
// account and make the bytes differ between computers. Every WebAssembly module, vendored or
// embedded in a finished page, is refused when it holds one (AUD-023-BLD003). A remapped path such
// as /rustc/<commit>/library/… or /cargo/registry/… names no computer and passes.

/** A home or root directory of Linux, macOS or Windows. */
const BUILDER_PATH = /(?:\/home\/[^/\0\s"]+\/|\/Users\/[^/\0\s"]+\/|\/root\/|[A-Za-z]:\\Users\\)/gu;
/** Base64 of a WebAssembly module starts so: "\0asm" encodes as AGFzbQ. */
const WASM_BASE64_START = "AGFzbQ";
/** The characters of standard base64, padding included. */
const BASE64_CHARACTER = /[A-Za-z0-9+/=]/u;
/** Enough of each path to name it in the error without printing the whole module. */
const SHOWN_PATH_LENGTH = 120;

/** The builder paths that `bytes` holds, each cut to a readable length. */
export function builderPathsIn(bytes) {
  const text = Buffer.from(bytes).toString("latin1");
  return [...text.matchAll(BUILDER_PATH)].map((match) =>
    text
      .slice(match.index, match.index + SHOWN_PATH_LENGTH)
      .split(/[\0"]/u)[0]
      .trim(),
  );
}

export function assertNoBuilderPaths(bytes, label) {
  const found = builderPathsIn(bytes);
  if (found.length > 0)
    throw new Error(
      `${label} holds ${found.length} absolute builder path(s), for example ${found[0]}; build it with the paths remapped.`,
    );
}

/**
 * The base64 texts in `text` that start like a WebAssembly module. A page embeds modules of
 * megabytes, too long for one regular expression match, so each is scanned by hand.
 */
function embeddedModules(text) {
  const blobs = [];
  for (let start = text.indexOf(WASM_BASE64_START); start !== -1;) {
    let end = start;
    while (end < text.length && BASE64_CHARACTER.test(text[end])) end += 1;
    blobs.push(text.slice(start, end));
    start = text.indexOf(WASM_BASE64_START, end);
  }
  return blobs;
}

/** Decodes every WebAssembly module embedded as base64 in `text` and refuses builder paths in it. */
export function assertEmbeddedWasmWithoutBuilderPaths(text, label) {
  let modules = 0;
  for (const blob of embeddedModules(text)) {
    const bytes = Buffer.from(blob, "base64");
    if (bytes.subarray(0, 4).toString("latin1") !== "\0asm") continue;
    modules += 1;
    assertNoBuilderPaths(bytes, `${label}: embedded WebAssembly module ${modules}`);
  }
  return modules;
}
