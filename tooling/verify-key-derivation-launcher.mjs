// Checks a built executable Key Derivation Tool with public test data only. Never point this at a
// live browser profile.
//
//   node tooling/verify-key-derivation-launcher.mjs [--profile multi-chain] [--launcher <path>] [--full]
//
// Without --launcher it checks the executable for this computer next to the profile's page in dist/
// (build it with tooling/build-key-derivation-launchers.mjs). It checks that:
//   - the program serves exactly the page it embeds, with the isolation and security headers;
//   - it refuses other hosts, paths and methods, and a silent connection does not hold up others;
//   - in a fresh Chromium context the page is cross-origin isolated, has shared memory, passes its
//     self-test, says it runs in fast mode, and starts and stops an MHFE worker;
//   - the page makes no request, stores nothing, and puts nothing in its URL, and the program
//     prints nothing after its start-up lines.
// --full also decrypts the published zero-12 vector of MHFE suite 3 (2 GiB of Argon2id per round,
// minutes) in the served page and in the same page opened as a file: both must give the phrase,
// and the served page must be faster.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { connect } from "node:net";
import { basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseBuildProfile } from "./build-profiles.mjs";
import { findLaunchers, LAUNCHER_PLATFORMS, launcherName } from "./key-derivation-launchers.mjs";
import { loadPlaywright } from "./playwright-loader.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const profile = parseBuildProfile();
const full = process.argv.includes("--full");
const { page: pagePath } = findLaunchers(resolve(root, "dist"), profile);
const launcherPath =
  launcherArgument() ?? resolve(pagePath, "..", launcherName(basename(pagePath), hostPlatform()));
const pageBytes = readFileSync(pagePath);
const pageDigest = createHash("sha256").update(pageBytes).digest("hex");

// The published zero-12 vector of suite 3 (the same values as tooling/verify-mhfe-vector.mjs).
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const PASSWORD = "public test password";
const CONTAINER =
  "donate stove tower picnic iron rescue trick shrimp roof rib home cigar bag pledge also nerve cycle famous provide heart ahead chunk caution peace";
/** A full decryption: twelve 2 GiB rounds, several minutes on one thread. */
const FULL_TIMEOUT_MS = 30 * 60 * 1000;

function launcherArgument() {
  const index = process.argv.indexOf("--launcher");
  return index >= 0 ? resolve(process.argv[index + 1]) : undefined;
}

function hostPlatform() {
  const system = { linux: "linux", win32: "windows", darwin: "macos" }[process.platform];
  const machine = { x64: "x86_64", arm64: "aarch64" }[process.arch];
  const platform = `${system}-${machine}`;
  if (!Object.hasOwn(LAUNCHER_PLATFORMS, platform)) throw new Error(`No launcher for ${platform}.`);
  return platform;
}

/** Starts the launcher and resolves with its port once it prints the address. */
function startLauncher() {
  const child = spawn(launcherPath, ["--no-browser"], { stdio: ["pipe", "pipe", "pipe"] });
  const output = { text: "" };
  child.stdout.on("data", (chunk) => (output.text += chunk));
  child.stderr.on("data", (chunk) => (output.text += chunk));
  const port = new Promise((resolvePort, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`The launcher printed no address:\n${output.text}`)),
      10000,
    );
    child.stdout.on("data", () => {
      const match = /Open http:\/\/127\.0\.0\.1:(\d+)\/ in your browser\./u.exec(output.text);
      if (match !== null) {
        clearTimeout(timer);
        resolvePort(Number(match[1]));
      }
    });
    child.on("exit", (code) =>
      reject(new Error(`The launcher ended with ${code}:\n${output.text}`)),
    );
    child.on("error", reject);
  });
  return { child, output, port };
}

/** Sends one raw HTTP request and resolves with the whole answer. */
function rawRequest(port, text) {
  return new Promise((resolveAnswer, reject) => {
    const socket = connect(port, "127.0.0.1", () => socket.end(text));
    const chunks = [];
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => resolveAnswer(Buffer.concat(chunks)));
    socket.on("error", reject);
    socket.setTimeout(15000, () => reject(new Error("No answer within 15 s.")));
  });
}

function splitAnswer(answer) {
  const end = answer.indexOf("\r\n\r\n");
  const head = answer.subarray(0, end).toString("latin1");
  return { status: head.split("\r\n")[0], head, body: answer.subarray(end + 4) };
}

async function checkHttp(port) {
  const host = `127.0.0.1:${port}`;
  const page = splitAnswer(await rawRequest(port, `GET / HTTP/1.1\r\nHost: ${host}\r\n\r\n`));
  assert.equal(page.status, "HTTP/1.1 200 OK");
  assert.equal(
    createHash("sha256").update(page.body).digest("hex"),
    pageDigest,
    "serves the embedded page",
  );
  for (const header of [
    "Cross-Origin-Opener-Policy: same-origin",
    "Cross-Origin-Embedder-Policy: require-corp",
    "Content-Security-Policy: frame-ancestors 'none'",
    "X-Frame-Options: DENY",
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: no-referrer",
    "Cache-Control: no-store",
  ]) {
    assert.ok(page.head.includes(`\r\n${header}`), `missing header ${header}`);
  }
  const head = splitAnswer(await rawRequest(port, `HEAD / HTTP/1.1\r\nHost: ${host}\r\n\r\n`));
  assert.equal(head.status, "HTTP/1.1 200 OK");
  assert.equal(head.body.length, 0, "HEAD sends no body");
  const refusals = [
    [`GET / HTTP/1.1\r\nHost: localhost:${port}\r\n\r\n`, "403"],
    [`GET / HTTP/1.1\r\nHost: attacker.example\r\n\r\n`, "403"],
    [`GET / HTTP/1.1\r\n\r\n`, "403"],
    [`GET /?seed=x HTTP/1.1\r\nHost: ${host}\r\n\r\n`, "404"],
    [`GET /favicon.ico HTTP/1.1\r\nHost: ${host}\r\n\r\n`, "404"],
    [`POST / HTTP/1.1\r\nHost: ${host}\r\nContent-Length: 0\r\n\r\n`, "405"],
    ["not http\r\n\r\n", "400"],
  ];
  for (const [request, code] of refusals) {
    const { status, body } = splitAnswer(await rawRequest(port, request));
    assert.ok(status.startsWith(`HTTP/1.1 ${code}`), `${JSON.stringify(request)} gave ${status}`);
    assert.equal(body.includes(pageBytes.subarray(0, 64)), false, "a refusal carries no page");
  }
  // A connection that never sends its request must not hold up the page for anyone else.
  const silent = connect(port, "127.0.0.1");
  const started = Date.now();
  const again = splitAnswer(await rawRequest(port, `GET / HTTP/1.1\r\nHost: ${host}\r\n\r\n`));
  assert.equal(again.status, "HTTP/1.1 200 OK");
  assert.ok(Date.now() - started < 5000, "the page came while a silent connection was open");
  silent.destroy();
}

async function storageSnapshot(page) {
  return page.evaluate(async () => ({
    localStorage: Object.keys(localStorage),
    sessionStorage: Object.keys(sessionStorage),
    caches: await caches.keys(),
    indexedDB: (await indexedDB.databases()).map(({ name }) => name),
    cookie: document.cookie,
  }));
}

async function openMhfe(page) {
  await page.locator("#crypto-self-test-status.passed").waitFor();
  await page.locator("#recovery-backup-mode").click();
  await page.locator('[data-recovery-tab][aria-controls="mhfe-panel"]').click();
}

/** Decrypts the public vector in the MHFE panel and returns the seconds it took. */
async function decryptVector(page) {
  await page
    .locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-restore-panel"]')
    .click();
  await page.locator("#mhfe-container").fill(CONTAINER);
  await page.locator("#mhfe-decrypt-password").fill(PASSWORD);
  const started = Date.now();
  await page.locator("#mhfe-decrypt").click();
  // The recovered phrase stays hidden until its Show button is pressed.
  const show = page.locator("#mhfe-decrypt-result button", { hasText: "Show phrase" }).first();
  await show.waitFor({ timeout: FULL_TIMEOUT_MS });
  const seconds = (Date.now() - started) / 1000;
  await show.click();
  const shown = await page
    .locator("#mhfe-decrypt-result")
    .evaluate((result) =>
      [
        result.textContent,
        ...[...result.querySelectorAll("input, textarea")].map((field) => field.value),
      ].join("\n"),
    );
  assert.ok(shown.includes(PHRASE), "the recovered phrase is the vector phrase");
  return seconds;
}

const { chromium } = await loadPlaywright();
const launcher = startLauncher();
const browser = await chromium.launch();
try {
  const port = await launcher.port;
  const startupText = launcher.output.text;
  assert.ok(
    startupText.includes(`SHA-256 of the embedded page verified: ${pageDigest}`),
    startupText,
  );
  await checkHttp(port);

  const context = await browser.newContext();
  const requests = [];
  context.on("request", (request) => requests.push(request.url()));
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(`http://127.0.0.1:${port}/`);
  const before = await storageSnapshot(page);
  assert.deepEqual(before, {
    localStorage: [],
    sessionStorage: [],
    caches: [],
    indexedDB: [],
    cookie: "",
  });
  assert.deepEqual(
    await page.evaluate(() => [globalThis.crossOriginIsolated, typeof SharedArrayBuffer]),
    [true, "function"],
    "the served page is cross-origin isolated and has shared memory",
  );
  await openMhfe(page);
  await page.waitForFunction(() =>
    /Fast mode/u.test(document.querySelector("#mhfe-mode")?.textContent ?? ""),
  );
  await page.locator("#mhfe-source").fill(PHRASE);
  await page.locator("#mhfe-encrypt-password").fill(PASSWORD);
  await page.locator("#mhfe-encrypt-password-confirm").fill(PASSWORD);
  await page.locator("#mhfe-encrypt").click();
  await page.waitForFunction(() =>
    /round 1 of 12/u.test(document.querySelector("#mhfe-encrypt-status")?.textContent ?? ""),
  );
  await page.locator("#mhfe-encrypt-stop").click();
  await page.waitForFunction(() =>
    /worker and its memory were discarded/u.test(
      document.querySelector("#mhfe-encrypt-status")?.textContent ?? "",
    ),
  );

  let times;
  if (full) {
    const fast = await decryptVector(page);
    const filePage = await context.newPage();
    await filePage.goto(pathToFileURL(pagePath).href);
    assert.equal(await filePage.evaluate(() => globalThis.crossOriginIsolated), false);
    await openMhfe(filePage);
    const slow = await decryptVector(filePage);
    await filePage.close();
    assert.ok(fast < slow, `fast mode took ${fast} s, the file page ${slow} s`);
    times = { fastSeconds: fast, fileSeconds: slow };
  }

  assert.deepEqual(await storageSnapshot(page), before, "the page stored nothing");
  assert.equal(
    new URL(page.url()).search + new URL(page.url()).hash,
    "",
    "nothing was put in the URL",
  );
  const httpRequests = requests.filter((url) => url.startsWith("http"));
  // Chromium itself asks for /favicon.ico; the page asks for nothing but itself.
  assert.deepEqual(
    httpRequests.filter((url) => url !== `http://127.0.0.1:${port}/favicon.ico`),
    [`http://127.0.0.1:${port}/`],
  );
  assert.deepEqual(pageErrors, []);
  assert.equal(launcher.output.text, startupText, "the launcher printed nothing after starting");
  console.log(
    `Verified ${basename(launcherPath)}: embedded page ${pageDigest}, headers, refusals, isolation, fast mode, ` +
      `MHFE worker, no requests or storage${times ? `, full vector (${JSON.stringify(times)})` : ""}.`,
  );
} finally {
  await browser.close();
  launcher.child.kill();
}
