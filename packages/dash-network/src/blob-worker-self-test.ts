/** Executes a real same-document Blob Worker under the artifact CSP. */
export async function runBlobWorkerSelfTest(timeoutMs = 3_000): Promise<number> {
  const startedAt = performance.now();
  if (typeof Worker !== 'function') throw new Error('This browser does not expose Web Workers.');
  const token = 'dash-key-tools-blob-worker-ok';
  const blob = new Blob([
    `self.onmessage=function(event){if(event.data===${JSON.stringify(token)})self.postMessage(event.data);};`,
  ], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url, { name: 'dash-key-tools-runtime-check' });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Blob Worker startup timed out.')), timeoutMs);
      worker.addEventListener('message', (event: MessageEvent<unknown>) => {
        window.clearTimeout(timeout);
        if (event.data !== token) reject(new Error('Blob Worker returned an unexpected self-test response.'));
        else resolve();
      }, { once: true });
      worker.addEventListener('error', (event) => {
        window.clearTimeout(timeout);
        reject(new Error(event.message || 'Blob Worker execution was blocked.'));
      }, { once: true });
      worker.postMessage(token);
    });
    return Math.round(performance.now() - startedAt);
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
}
