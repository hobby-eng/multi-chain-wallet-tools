import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { WASM_CATALOG } from "./wasm-modules.mjs";
import { resolveRustToolchain } from "./rust-toolchain.mjs";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const { cargo, environment } = resolveRustToolchain(root);
for (const { manifestPath } of WASM_CATALOG.nativeCrates()) {
  const result = spawnSync(
    cargo,
    ["test", "--manifest-path", resolve(root, manifestPath), "--locked"],
    {
      cwd: root,
      env: environment,
      stdio: "inherit",
    },
  );
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
