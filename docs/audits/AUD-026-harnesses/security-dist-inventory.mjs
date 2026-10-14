// AUD-026 security reviewer: the offline and isolation boundaries of the final dist pages, read
// from the bytes the coordinator built, not from templates. For every page of both editions it
// records the SHA-256, every Content-Security-Policy (also the Secret Vault's, which the Scanner
// shell carries inside a JavaScript string), the Scanner iframe's sandbox, external resource tags
// and a lexical inventory of DOM sinks, dynamic code, storage, console and network APIs. It exits
// non-zero when a boundary differs from the reviewed contract. A lexical count is evidence of
// presence, not of reachability: generated glue is classified separately in the findings file.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const editions = ["multi-chain-edition", "dash-community-edition"];
const tools = ["key-derivation", "psbt-inspector", "activity-viewer", "discovery-scanner"];
const failures = [];
const fail = (page, message) => failures.push(`${page}: ${message}`);

/** Directives of a policy string as a map of name to source list. */
function directives(policy) {
  const map = new Map();
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/u);
    if (name) map.set(name.toLowerCase(), sources);
  }
  return map;
}

function expectDirective(page, label, policy, name, expected) {
  const actual = directives(policy).get(name);
  if (actual === undefined || actual.join(" ") !== expected)
    fail(page, `${label} ${name} is "${actual?.join(" ") ?? "(missing)"}", expected "${expected}"`);
}

const LEXICAL = {
  innerHTML: /\.innerHTML\s*=/gu,
  outerHTML: /\.outerHTML\s*=/gu,
  insertAdjacentHTML: /insertAdjacentHTML\s*\(/gu,
  documentWrite: /document\.write(?:ln)?\s*\(/gu,
  srcdocAssign: /\.srcdoc\s*=/gu,
  evalCall: /(?<![.\w$])eval\s*\(/gu,
  newFunction: /new\s+Function\s*\(/gu,
  functionCall: /(?<![.\w$])Function\s*\(/gu,
  stringTimer: /set(?:Timeout|Interval)\s*\(\s*["'`]/gu,
  localStorage: /\blocalStorage\b/gu,
  sessionStorage: /\bsessionStorage\b/gu,
  indexedDB: /\bindexedDB\b/gu,
  cookie: /document\.cookie/gu,
  cacheStorage: /\bcaches\.open\b/gu,
  serviceWorker: /serviceWorker\.register/gu,
  fetchCall: /(?<![.\w$])fetch\s*\(/gu,
  xmlHttpRequest: /\bXMLHttpRequest\b/gu,
  webSocket: /\bnew\s+WebSocket\b/gu,
  eventSource: /\bnew\s+EventSource\b/gu,
  sendBeacon: /sendBeacon\s*\(/gu,
  rtcPeer: /RTCPeerConnection/gu,
  importScripts: /importScripts\s*\(/gu,
  dynamicImport: /(?<![.\w$])import\s*\(\s*[^)\s]/gu,
  windowOpen: /window\.open\s*\(/gu,
  consoleLog: /console\.log\b/gu,
  consoleOther: /console\.(?:warn|error|info|debug|trace)\b/gu,
  mathRandom: /Math\.random\b/gu,
  wasmCompile: /WebAssembly\.(?:compile|instantiate)(?:Streaming)?\s*\(/gu,
};

const results = [];
for (const edition of editions) {
  for (const tool of tools) {
    const directory = path.join(root, "dist", edition, tool);
    const file = readdirSync(directory).find((name) => name.endsWith(".html"));
    if (file === undefined) {
      fail(`${edition}/${tool}`, "no HTML page");
      continue;
    }
    const page = `${edition}/${tool}/${file}`;
    const html = readFileSync(path.join(directory, file), "utf8");
    const sha256 = createHash("sha256").update(html).digest("hex");
    // The page's own policy stands in its head; the vault document travels inside the shell's
    // script (the minifier writes it as a template literal, so its quotes are not escaped), so a
    // policy after the first <script> belongs to an embedded document.
    const firstScript = html.indexOf("<script");
    const allPolicies = [
      ...html.matchAll(
        /<meta\s+http-equiv=\\?"Content-Security-Policy\\?"\s+content=\\?"([^"\\]+)\\?"/gu,
      ),
    ];
    const metaPolicies = allPolicies
      .filter((match) => match.index < firstScript)
      .map((match) => match[1]);
    const escapedPolicies = allPolicies
      .filter((match) => match.index > firstScript)
      .map((match) => match[1]);
    const counts = Object.fromEntries(
      Object.entries(LEXICAL).map(([name, pattern]) => [name, html.match(pattern)?.length ?? 0]),
    );
    const externalTags = [
      ...html.matchAll(/<(?:script|link|img|iframe|source|video|audio|embed|object)\b[^>]*>/giu),
    ]
      .map((match) => match[0])
      .filter((tag) => /\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//iu.test(tag));
    const urlHosts = [
      ...new Set(
        [...html.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?=[/:"'\\\s`)]|$)/giu)].map(
          (match) => match[1].toLowerCase(),
        ),
      ),
    ].sort();
    const iframes = [...html.matchAll(/<iframe\b[^>]*>/gu)].map((match) => match[0]);

    if (metaPolicies.length !== 1) fail(page, `${metaPolicies.length} top-level CSP meta tags`);
    const policy = metaPolicies[0] ?? "";
    for (const forbidden of ["'unsafe-eval'", "'unsafe-hashes'", "'strict-dynamic'", "data:"])
      if (policy.includes(forbidden)) fail(page, `top-level CSP grants ${forbidden}`);
    if (/script-src[^;]*'unsafe-inline'/u.test(policy))
      fail(page, "top-level CSP lets inline scripts run");
    expectDirective(page, "top-level", policy, "default-src", "'none'");
    expectDirective(page, "top-level", policy, "object-src", "'none'");
    expectDirective(page, "top-level", policy, "base-uri", "'none'");
    expectDirective(page, "top-level", policy, "form-action", "'none'");
    if (externalTags.length > 0) fail(page, `external resource tags: ${externalTags.join(" | ")}`);

    if (tool === "key-derivation" || tool === "psbt-inspector") {
      expectDirective(page, "offline", policy, "connect-src", "'none'");
      expectDirective(page, "offline", policy, "frame-src", "'none'");
      expectDirective(page, "offline", policy, "img-src", "'none'");
      if (iframes.length !== 0) fail(page, "offline page contains an iframe");
      if (escapedPolicies.length !== 0) fail(page, "offline page carries an embedded document");
    }
    if (tool === "activity-viewer") {
      expectDirective(page, "connected", policy, "connect-src", "https:");
      expectDirective(page, "connected", policy, "frame-src", "'none'");
    }
    if (tool === "discovery-scanner") {
      expectDirective(page, "shell", policy, "connect-src", "https:");
      expectDirective(page, "shell", policy, "frame-src", "'self'");
      if (iframes.length !== 1) fail(page, `${iframes.length} iframes in the shell`);
      const sandbox = /\bsandbox="([^"]*)"/u.exec(iframes[0] ?? "")?.[1];
      if (sandbox !== "allow-scripts")
        fail(page, `vault sandbox is "${sandbox ?? "(missing)"}", expected "allow-scripts"`);
      if (escapedPolicies.length !== 1)
        fail(page, `${escapedPolicies.length} embedded vault CSPs, expected 1`);
      const vault = escapedPolicies[0] ?? "";
      for (const forbidden of ["'unsafe-eval'", "'unsafe-inline' 'wasm", "data:", "https:"])
        if (directives(vault).get("script-src")?.join(" ").includes(forbidden))
          fail(page, `vault script-src grants ${forbidden}`);
      for (const [name, value] of [
        ["default-src", "'none'"],
        ["connect-src", "'none'"],
        ["worker-src", "'none'"],
        ["frame-src", "'none'"],
        ["img-src", "'none'"],
        ["font-src", "'none'"],
        ["object-src", "'none'"],
        ["form-action", "'none'"],
        ["base-uri", "'none'"],
      ])
        expectDirective(page, "vault", vault, name, value);
      // srcdoc inherits the shell's policy: the vault's script hash must also be in the shell's.
      const vaultHashes = directives(vault)
        .get("script-src")
        ?.filter((s) => s.startsWith("'sha"));
      for (const hash of vaultHashes ?? [])
        if (!directives(policy).get("script-src")?.includes(hash))
          fail(page, `vault script hash ${hash} is not authorized by the shell policy`);
    }
    results.push({
      page,
      sha256,
      bytes: Buffer.byteLength(html),
      policy,
      embeddedPolicies: escapedPolicies,
      iframes,
      counts,
      urlHostCount: urlHosts.length,
      urlHosts,
    });
  }
}

console.log(JSON.stringify({ results, failures }, null, 2));
if (failures.length > 0) {
  console.error(`FAILED ${failures.length}:\n${failures.join("\n")}`);
  process.exit(1);
}
console.error(`PASS: ${results.length} pages`);
