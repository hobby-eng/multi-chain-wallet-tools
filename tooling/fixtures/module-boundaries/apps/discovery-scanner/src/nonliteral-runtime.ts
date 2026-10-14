import { pathToFileURL } from "node:url";

// The same computed module URL is forbidden when placed in an application runtime source.
export function loadBuiltModule(output: string) {
  return import(`${pathToFileURL(output).href}?run=${Date.now()}`);
}
