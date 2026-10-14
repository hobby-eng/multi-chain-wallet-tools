// The steps every tool's single-file HTML build shares: its styles, the settings of a browser
// bundle, the inlining of the bundle with the CSP hash of the exact script, and the artifact with
// its checksum file. Each build script keeps only what is its own.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { transform } from "esbuild";

/** The esbuild settings of every browser bundle; a script adds its entry, plugins and defines. */
export const BROWSER_BUNDLE = Object.freeze({
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120", "firefox120", "safari17"],
  treeShaking: true,
  minify: true,
  legalComments: "inline",
  write: false,
});

/** The CSP source that authorizes exactly `javascript` as an inline script. */
export function scriptCsp(javascript) {
  return `'sha256-${createHash("sha256").update(javascript).digest("base64")}'`;
}

/**
 * The page's styles, minified: the shared ones, the tool's own (`ownStylesheets`, from the
 * repository root), the tool shell and the profile's theme.
 */
export async function toolCss(root, profile, ownStylesheets = []) {
  const read = (path) => readFileSync(resolve(root, path), "utf8");
  const parts = [
    read("packages/shared-ui/styles/main.css"),
    ...ownStylesheets.map(read),
    read("packages/shared-ui/styles/tool-shell.css"),
    profile.themeStylesheet === undefined ? "" : read(profile.themeStylesheet),
  ];
  return (
    await transform(parts.join("\n"), { loader: "css", minify: true, legalComments: "inline" })
  ).code;
}

/** The JavaScript of a bundle; refuses a build that produced none. */
export function bundleText(bundled, label) {
  const javascript = bundled.outputFiles[0]?.text;
  if (javascript === undefined) throw new Error(`esbuild did not produce the ${label} bundle.`);
  return javascript;
}

/** `javascript` made safe inside one inline script element: no tag in it opens or closes one. */
export function inlineSafeJavascript(javascript) {
  return javascript.replaceAll("</script", "<\\/script").replaceAll("<script", "\\x3cscript");
}

/**
 * Inlines `css` and `javascript` into `template` and sets the CSP hash of the exact script the
 * page will run, template white space included. `label` names the page in a refusal; `cspMarker`
 * is where the template takes the hash, and `extraScriptSources` adds sources the script needs,
 * such as 'wasm-unsafe-eval'.
 */
export function inlineApplication(
  template,
  css,
  javascript,
  label,
  { cspMarker = "__INLINE_SCRIPT_CSP__", extraScriptSources = "" } = {},
) {
  if (
    !template.includes("/*__INLINE_CSS__*/") ||
    !template.includes("/*__INLINE_JS__*/") ||
    !template.includes(cspMarker)
  )
    throw new Error(`${label} template is missing an inline build marker.`);
  const safeJavascript = inlineSafeJavascript(javascript);
  // The marker is renamed before the script goes in, so that the same text in the bundle is never
  // taken for it.
  const hashMarker = "__INLINE_SCRIPT_HASH_PENDING__";
  // Callback replacements keep '$&', '$`' and "$'" in the bundle literal: as a replacement string
  // String.replace would read them as patterns and could duplicate the template.
  const html = template
    .replace(cspMarker, hashMarker)
    .replace("/*__INLINE_CSS__*/", () => css)
    .replace("/*__INLINE_JS__*/", () => safeJavascript);
  return withScriptHash(html, hashMarker, label, extraScriptSources);
}

/** The page's one inline script, as the browser will run it. */
export function inlineScriptOf(html, label) {
  const scriptStart = html.indexOf("<script>");
  const scriptEnd = html.lastIndexOf("</script>");
  if (scriptStart < 0 || scriptEnd <= scriptStart)
    throw new Error(`${label} HTML did not contain the generated inline script.`);
  return html.slice(scriptStart + "<script>".length, scriptEnd);
}

/** Replaces `marker` with the CSP hash of the page's one inline script and any extra sources. */
export function withScriptHash(html, marker, label, extraScriptSources = "") {
  return html.replace(marker, `${scriptCsp(inlineScriptOf(html, label))}${extraScriptSources}`);
}

/**
 * Writes the artifact (`customArtifact`, or the tool's place under dist/) with its checksum file,
 * which names it `displayName(path)`, and reports both. Returns the artifact's path.
 */
export function writeToolArtifact(root, tool, customArtifact, html, displayName) {
  const artifact =
    customArtifact ?? resolve(root, "dist", tool.artifactDirectory, tool.artifactName);
  mkdirSync(resolve(artifact, ".."), { recursive: true });
  writeFileSync(artifact, html);
  const checksum = createHash("sha256").update(html).digest("hex");
  writeFileSync(`${artifact}.sha256`, `${checksum}  ${displayName(artifact)}\n`);
  console.log(
    `Built ${customArtifact === undefined ? `dist/${tool.artifactRelativePath}` : artifact} (${Buffer.byteLength(html).toLocaleString()} bytes)`,
  );
  console.log(`SHA-256 ${checksum}`);
  return artifact;
}
