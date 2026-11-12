// Repeatable randomness for browser cases of the Deriver's generation, installed by the test only
// (Playwright's addInitScript): nothing of it ships in the page. A case sets a window variable
// before it presses Generate; while the variable is null the page's own crypto.getRandomValues()
// runs. Every other part of a draw, and every check of its phrase, is the page's own.

/** The wallet-check draw's workers and the page's own draws on the main thread. */
export class RandomFixtures {
  /**
   * The wallet-check draw's workers, read when a worker starts:
   * - window.mhfeRandom: null for the browser's own source; "stuck" for a source that gives zeros,
   *   which the draw must refuse; a number, the public profile-vector entropy of 24 zero bytes and
   *   that counter in the last eight; or 64 hex digits of entropy;
   * - window.mhfeFillerDraws: draws of all-zero entropy before that entropy, after the two
   *   different probes that the draw's source check asks for;
   * - window.mhfeDrawDelay: milliseconds the worker's first draw is held.
   */
  static async walletCheckDraw(context) {
    await context.addInitScript(() => {
      const NativeBlob = window.Blob;
      const NativeWorker = window.Worker;
      const sources = new WeakMap();
      const urls = new Map();
      const createUrl = URL.createObjectURL.bind(URL);
      window.Blob = class extends NativeBlob {
        constructor(parts, options) {
          super(parts, options);
          if (parts?.every((part) => typeof part === "string")) sources.set(this, parts.join(""));
        }
      };
      URL.createObjectURL = (blob) => {
        const url = createUrl(blob);
        if (sources.has(blob)) urls.set(url, sources.get(blob));
        return url;
      };
      window.mhfeRandom = null;
      window.mhfeDrawDelay = 0;
      window.mhfeFillerDraws = 0;
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          let fixtureUrl;
          const random = window.mhfeRandom;
          // The draw's worker is the one script that hashes the profile's domain tag.
          if (random !== null && urls.get(url)?.includes("MHFE-WALLET-CHECK-SEED-1")) {
            const entropy =
              typeof random === "number"
                ? `new DataView(fixture.buffer).setBigUint64(24, BigInt(${random}), false);`
                : `fixture.set(${JSON.stringify(random)}.match(/../g).map((pair) => parseInt(pair, 16)));`;
            const prefix =
              random === "stuck"
                ? `Object.defineProperty(crypto, "getRandomValues", { value: (bytes) => bytes.fill(0) });\n`
                : `{
            const fixture = new Uint8Array(32);
            ${entropy}
            let calls = 0;
            Object.defineProperty(crypto, "getRandomValues", { value: (bytes) => {
              calls += 1;
              if (calls === 3) {
                const until = performance.now() + ${window.mhfeDrawDelay};
                while (performance.now() < until) {}
              }
              const filler = calls > 2 && calls <= 2 + ${window.mhfeFillerDraws};
              for (let i = 0; i < bytes.length; i += 1)
                bytes[i] = calls <= 2 ? 1 + ((i + calls) % 254) : filler ? 0 : fixture[i % 32];
              return bytes;
            }});
          }\n`;
            fixtureUrl = createUrl(
              new NativeBlob([prefix, urls.get(url)], { type: "text/javascript" }),
            );
          }
          super(fixtureUrl ?? url, options);
        }
      };
    });
  }

  /**
   * The page's own crypto.getRandomValues(), for draws on the main thread (TON's): while
   * window.pageRandom is { filler, entropy }, the first `filler` calls give all-zero entropy and
   * every later one the 64 hex digits of `entropy`, repeated over the buffer.
   */
  static async page(context) {
    await context.addInitScript(() => {
      const native = crypto.getRandomValues.bind(crypto);
      let calls = 0;
      window.pageRandom = null;
      Object.defineProperty(crypto, "getRandomValues", {
        value: (bytes) => {
          const plan = window.pageRandom;
          if (plan === null) {
            calls = 0;
            return native(bytes);
          }
          calls += 1;
          const entropy = plan.entropy.match(/../g).map((pair) => parseInt(pair, 16));
          for (let i = 0; i < bytes.length; i += 1)
            bytes[i] = calls <= plan.filler ? 0 : entropy[i % 32];
          return bytes;
        },
      });
    });
  }
}
