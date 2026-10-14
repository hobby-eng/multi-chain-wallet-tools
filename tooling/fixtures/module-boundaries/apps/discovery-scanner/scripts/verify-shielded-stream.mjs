import { pathToFileURL } from "node:url";

// Static-analysis fixture for the reviewed Node script; the test never invokes the loader.
export function loadBuiltModule(output) {
  return import(`${pathToFileURL(output).href}?run=${Date.now()}`);
}
