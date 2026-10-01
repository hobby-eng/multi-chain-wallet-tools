#!/usr/bin/env node
// Reads the Content Security Policy that each of the eight built pages actually carries (the
// <meta> in the final HTML, not a template string) and checks the offline boundary
// independently of the repository's own artifact gates:
//   - every page: default-src 'none', no 'unsafe-eval', no 'unsafe-inline' scripts, base-uri and
//     form-action 'none', no external <script src>, <link href> or <iframe src>;
//   - the offline pages (Key Derivation Tool, PSBT & Multisig Inspector): connect-src 'none' and
//     no http(s) origin in any directive;
//   - the connected pages: connect-src allows HTTPS only (an https origin or the bare https:
//     scheme, which the Evo SDK needs for its changing DAPI node list; docs/ARCHITECTURE.md
//     documents "HTTPS only"), never http:, ws: or a wildcard.
// Writes artifact-csp.json into the evidence folder and exits 1 when a check fails.
//
// Usage: node docs/audits/AUD-019-harnesses/inspect-artifact-csp.mjs (after pnpm build:html)
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EVIDENCE_DIR = process.env.AUDIT_EVIDENCE_DIR ?? "docs/audits/AUD-019-evidence";
const PAGES = [
  ["multi-chain", "key-derivation/Wallet_Key_Derivation_Tool.html", "offline"],
  ["multi-chain", "psbt-inspector/PSBT_Multisig_Inspector.html", "offline"],
  ["multi-chain", "activity-viewer/Wallet_Activity_Viewer.html", "connected"],
  ["multi-chain", "discovery-scanner/Wallet_Discovery_Scanner.html", "connected"],
  ["dash-community", "key-derivation/Dash_Community_Key_Derivation_Tool.html", "offline"],
  ["dash-community", "psbt-inspector/Dash_Community_PSBT_Multisig_Inspector.html", "offline"],
  ["dash-community", "activity-viewer/Dash_Community_Activity_Viewer.html", "connected"],
  ["dash-community", "discovery-scanner/Dash_Community_Discovery_Scanner.html", "connected"],
];

/** The policy of the outer page: the first CSP <meta> before </head>. */
function outerPolicy(html) {
  const head = html.slice(0, html.indexOf("</head>"));
  const meta = /<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*>/iu.exec(head)?.[0];
  if (meta === undefined) return null;
  const content = /\bcontent="([^"]*)"/u.exec(meta)?.[1];
  return content ?? null;
}

function directives(policy) {
  return Object.fromEntries(
    policy
      .split(";")
      .map((part) => part.trim().split(/\s+/u))
      .filter(([name]) => name)
      .map(([name, ...values]) => [name, values]),
  );
}

const report = [];
let failures = 0;
for (const [profile, relative, kind] of PAGES) {
  const path = join("dist", `${profile}-edition`, relative);
  const bytes = readFileSync(path);
  const html = bytes.toString("utf8");
  const problems = [];
  const policy = outerPolicy(html);
  if (policy === null) problems.push("no CSP meta in <head>");
  const parsed = policy === null ? {} : directives(policy);
  const values = (name) => parsed[name] ?? [];
  if (values("default-src").join(" ") !== "'none'") problems.push("default-src is not 'none'");
  if (Object.values(parsed).some((list) => list.includes("'unsafe-eval'")))
    problems.push("'unsafe-eval' allowed");
  if (values("script-src").includes("'unsafe-inline'"))
    problems.push("script-src allows 'unsafe-inline'");
  for (const name of ["base-uri", "form-action"])
    if (values(name).join(" ") !== "'none'") problems.push(`${name} is not 'none'`);
  const remoteOrigins = Object.entries(parsed).flatMap(([name, list]) =>
    list.filter((value) => /^(https?:|wss?:|\*)/u.test(value)).map((value) => `${name} ${value}`),
  );
  if (kind === "offline") {
    if (values("connect-src").join(" ") !== "'none'") problems.push("connect-src is not 'none'");
    if (remoteOrigins.length > 0) problems.push(`remote origins: ${remoteOrigins.join(", ")}`);
  } else {
    const insecure = values("connect-src").filter(
      (value) =>
        value !== "'none'" &&
        value !== "'self'" &&
        value !== "https:" &&
        !value.startsWith("https://"),
    );
    if (insecure.length > 0) problems.push(`connect-src non-https entries: ${insecure.join(" ")}`);
  }
  const externalTags = [
    ...html.matchAll(/<(script|iframe)\b[^>]*\bsrc="(?!data:|blob:)[^"]+"/giu),
    ...html.matchAll(/<link\b[^>]*\bhref="https?:[^"]+"/giu),
  ].map((match) => match[0].slice(0, 80));
  if (externalTags.length > 0) problems.push(`external resources: ${externalTags.join(" | ")}`);
  failures += problems.length;
  report.push({
    profile,
    page: relative,
    kind,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    directives: Object.fromEntries(
      Object.entries(parsed).map(([name, list]) => [
        name,
        list.map((value) => (value.startsWith("'sha256-") ? "'sha256-…'" : value)),
      ]),
    ),
    connectSrc: values("connect-src"),
    problems,
  });
}
mkdirSync(EVIDENCE_DIR, { recursive: true });
writeFileSync(join(EVIDENCE_DIR, "artifact-csp.json"), `${JSON.stringify(report, null, 2)}\n`);
for (const { profile, page, problems, connectSrc } of report)
  console.log(
    `${problems.length === 0 ? "PASS" : "FAIL"} ${profile} ${page} connect-src: ${connectSrc.join(" ")}${problems.length ? ` :: ${problems.join("; ")}` : ""}`,
  );
process.exit(failures === 0 ? 0 : 1);
