import { pathToFileURL } from "node:url";

/**
 * Loads either the repository's pinned Playwright package or an explicit local
 * module override. CommonJS entry points expose the browser API through
 * `default`, while ESM entry points expose named bindings.
 */
export async function loadPlaywright(moduleOverride = process.env.PLAYWRIGHT_MODULE) {
  const loaded =
    moduleOverride === undefined
      ? await import("playwright")
      : await import(pathToFileURL(moduleOverride).href);
  const api = loaded.default ?? loaded;
  if (api.chromium === undefined || api.firefox === undefined) {
    throw new Error("The selected Playwright module does not expose Chromium and Firefox.");
  }
  return api;
}

/**
 * Starts `browserName` of `playwright` for a check that reports each browser run. A browser that
 * cannot start is recorded in `report` as a failed run and saved; the caller then goes on with the
 * next one, so undefined comes back.
 */
export async function launchForReport(playwright, browserName, executablePath, report, save) {
  try {
    const engine = { chromium: playwright.chromium, firefox: playwright.firefox }[browserName];
    if (engine === undefined) throw new Error(`Unknown browser engine: ${browserName}`);
    return await engine.launch({ headless: process.env.HEADED !== "1", executablePath });
  } catch (error) {
    report.runs.push({ browser: browserName, passed: false, error: String(error) });
    save();
    return undefined;
  }
}
