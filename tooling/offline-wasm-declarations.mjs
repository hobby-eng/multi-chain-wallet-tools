import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format } from 'prettier';

const prettierOptions = {
  parser: 'typescript',
  singleQuote: true,
  semi: true,
  trailingComma: 'all',
  printWidth: 120,
};

function removeAsyncInitializer(source, label) {
  const declaration = source.lastIndexOf('export default function __wbg_init');
  if (declaration < 0) throw new Error(`${label} declaration is missing the wasm-bindgen async initializer.`);
  const documentation = source.lastIndexOf('\n/**', declaration);
  if (documentation < 0) throw new Error(`${label} declaration is missing async initializer documentation.`);
  const tail = source.slice(declaration);
  if (!/^export default function __wbg_init[^\n]*;\s*$/u.test(tail)) {
    throw new Error(`${label} has unexpected declarations after its async initializer.`);
  }
  return `${source.slice(0, documentation).trimEnd()}\n`;
}

export async function writeOfflineWasmDeclarations(staging, generated, stem, label) {
  const apiSource = readFileSync(resolve(staging, `${stem}.d.ts`), 'utf8');
  const api = removeAsyncInitializer(apiSource, label);
  if (/__wbg_init|export\s+default/u.test(api)) {
    throw new Error(`${label} declaration still advertises an unavailable async initializer.`);
  }
  const bindings = readFileSync(resolve(staging, `${stem}_bg.wasm.d.ts`), 'utf8');
  writeFileSync(resolve(generated, `${stem}.d.ts`), await format(api, prettierOptions));
  writeFileSync(resolve(generated, `${stem}_bg.wasm.d.ts`), await format(bindings, prettierOptions));
}
