import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
try {
  const { runUpstreamVersionCheck } = await import('./upstream-version-check.mjs');
  process.exitCode = await runUpstreamVersionCheck(root);
} catch (cause) {
  process.stdout.write([
    '# Pinned upstream dependency checker failed',
    '',
    '**Infrastructure/parser failure — this is not an update-available signal.**',
    '',
    cause instanceof Error ? cause.message : String(cause),
    '',
  ].join('\n'));
  process.exitCode = 2;
}
