// The BIP39 English wordlist inside a MnemoCode worker: the page's own copy, which the page puts
// before the worker's script when it starts the worker (mnemocode-worker-client.ts), so that the
// artifact embeds the list once (verify-key-derivation-artifact.mjs). The build resolves
// @scure/bip39/wordlists/english.js to this module in the worker bundles only.

/** The global the page's prelude sets; the name says where it comes from. */
const PAGE_WORDLIST = "ckdPageBip39English";
/** BIP39 wordlists have 2^11 words. */
const WORD_COUNT = 2048;

function pageWordlist(): string[] {
  const list: unknown = (globalThis as Record<string, unknown>)[PAGE_WORDLIST];
  if (
    !Array.isArray(list) ||
    list.length !== WORD_COUNT ||
    !list.every((word) => typeof word === "string") ||
    list[0] !== "abandon" ||
    list[WORD_COUNT - 1] !== "zoo"
  )
    throw new Error("The worker was started without the page's BIP39 English wordlist.");
  return Object.freeze([...list]) as string[];
}

export const wordlist: string[] = pageWordlist();
