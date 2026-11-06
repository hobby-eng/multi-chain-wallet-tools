import { RecoveryWorkerWordlists } from "./recovery-worker-wordlists.js";

/** The page's canonical public SLIP39 dictionary, supplied before this worker's script. */
export const SLIP39_WORDLIST = RecoveryWorkerWordlists.read("slip39");
