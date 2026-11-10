// Steganography in the Deriver (MnemoCode docs/STEGANOGRAPHY.md): a message, a small file or a
// MnemoCode backup record hidden in a JPEG photograph or an MP3 file under a container password,
// optionally with a decoy under a second password, or divided across 2 to 16 files of which a
// quorum recovers it. MnemoCode's WebAssembly reads, writes and verifies every file and owns every
// rule; this module drives its stepped jobs in a worker (Argon2id is one blocking 128 MiB step),
// re-reads each written file from the Blob the page will save, and gives the page plain results.
import { errorCode } from "@ckd/core/refusal.js";
import type { StegoContent, StegoJob } from "@ckd/mnemocode-wasm/mnemocode.js";
import type { MnemoCodeBinding } from "./mnemocode-engine.js";

/** What a hidden record holds: a MnemoCode backup record, or exact message or file bytes. */
export type StegoContents =
  | { readonly kind: "backup"; readonly record: string }
  | { readonly kind: "opaque"; readonly bytes: Uint8Array };

/** A carrier as the page read it: its bytes, its name and its media type, kept for the result. */
export interface StegoCarrier {
  readonly bytes: Uint8Array;
  readonly name: string;
  readonly type: string;
}

/** What a job is doing, as MnemoCode's stage names say it, and of which file. */
export interface StegoProgress {
  readonly stage: string;
  /** The file, from 1, of several. */
  readonly file?: number;
}

/** The guaranteed message bytes at each density, least dense first; 0 where none fits. */
export interface StegoCapacityRow {
  readonly density: string;
  readonly bytes: number;
}

/** A decoy password checked against the original's: MnemoCode's private feedback. */
export interface StegoPairCheck {
  readonly accepted: boolean;
  readonly differencePercent: number;
  readonly refusalCode: string | undefined;
}

export interface StegoAnalyzeRequest {
  readonly carriers: readonly StegoCarrier[];
  /** The new container password of the original message (or of every file of a set). */
  readonly password: string;
  /** A decoy's password, with one carrier only. */
  readonly decoyPassword?: string;
}

/** Where a record fits: per density, and the conditions MnemoCode noticed in each file. */
export interface StegoAnalysis {
  readonly rows: readonly StegoCapacityRow[];
  /** The decoy pair's check; refused pairs have no rows. */
  readonly pair?: StegoPairCheck;
  readonly notices: readonly (readonly string[])[];
}

export interface StegoHideRequest {
  readonly carriers: readonly StegoCarrier[];
  readonly password: string;
  readonly contents: StegoContents;
  readonly decoy?: { readonly password: string; readonly contents: StegoContents };
  readonly density: string;
  /** For a set of several files: how many recover the contents. */
  readonly quorum?: number;
}

/** A written file whose saved bytes were read back from `blob` and opened with every password. */
export interface StegoWrittenFile {
  readonly blob: Blob;
  readonly name: string;
  readonly notices: readonly string[];
}

export interface StegoHidden {
  readonly files: readonly StegoWrittenFile[];
}

export interface StegoOpenRequest {
  readonly carriers: readonly StegoCarrier[];
  readonly password: string;
}

/** What a password opened; nothing found never means that a file is empty. */
export type StegoOpened =
  | { readonly kind: "backup"; readonly record: string }
  | { readonly kind: "opaque"; readonly bytes: Uint8Array }
  | { readonly kind: "no-record"; readonly files: readonly number[] }
  | { readonly kind: "too-few"; readonly needed: number; readonly available: number };

/** The roles of an analysis, as the binding names them. */
const ROLE = {
  original: "original",
  decoy: "decoy",
  behind: "original-behind-decoy",
} as const;

/** The compact backup's own bytes beside its mode and form names: 24 words at 11 bits. */
const COMPACT_HEADER_BYTES = 3;
const COMPACT_MOST_WORD_BYTES = Math.ceil((24 * 11) / 8);
const RECORD_HEADER = /^MNC1:([a-z0-9-]+):([a-z0-9-]+):/u;

/**
 * The most bytes `contents` take in a record. A backup record is packed by MnemoCode
 * (docs/design/steganography-format.md, compact backup data: three length bytes, the mode and form
 * names, eleven bits a word); the page counts it at 24 words, the most, so that a density it offers
 * always takes it. Message and file bytes count as they are.
 */
export function stegoContentBytes(contents: StegoContents): number {
  if (contents.kind === "opaque") return contents.bytes.byteLength;
  const header = RECORD_HEADER.exec(contents.record.trim());
  if (header === null) return new TextEncoder().encode(contents.record).byteLength;
  return (
    COMPACT_HEADER_BYTES +
    (header[1] ?? "").length +
    (header[2] ?? "").length +
    COMPACT_MOST_WORD_BYTES
  );
}

/** The terminal statuses of a job; every other status is still working. */
const TERMINAL = new Set([
  "found",
  "verified",
  "saved-verified",
  "no-record",
  "analyzed",
  "cancelled",
  "failed",
  "consumed",
]);

/** Steps `job` to a terminal status, reporting each stage; throws MnemoCode's refusal. */
function finish(job: StegoJob, onProgress: (stage: string) => void): string {
  for (;;) {
    const stage = job.step();
    if (TERMINAL.has(stage) || TERMINAL.has(job.status)) return job.status;
    onProgress(stage);
  }
}

/** The binding's content owner of `contents`. */
function contentOf(binding: MnemoCodeBinding, contents: StegoContents): StegoContent {
  return contents.kind === "backup"
    ? binding.StegoContent.backup(contents.record)
    : binding.StegoContent.opaque(contents.bytes);
}

/** A refusal for an outcome the page does not expect, in MnemoCode's words where it gave some. */
function unexpected(status: string): Error {
  const error = new Error(
    status === "cancelled" ? "The work was cancelled." : "MnemoCode could not finish the work.",
  );
  Object.defineProperty(error, "code", { value: `wallet.stego.${status}`, enumerable: true });
  return error;
}

/** Drives MnemoCode's steganography jobs in a worker, with the binding the worker loaded. */
export class MnemoCodeStegoJobs {
  readonly #binding: MnemoCodeBinding;

  constructor(binding: MnemoCodeBinding) {
    this.#binding = binding;
  }

  /** The guaranteed space of a new record at every density, for the page's table. */
  analyze(
    request: StegoAnalyzeRequest,
    onProgress: (progress: StegoProgress) => void,
  ): StegoAnalysis {
    const binding = this.#binding;
    const densities = this.#densities();
    binding.checkStegoFileSizes(Float64Array.from(request.carriers, (c) => c.bytes.byteLength));
    const notices: string[][] = [];
    if (request.carriers.length > 1) {
      // A set: each file analyzed for the same password, then their common space.
      const set = new binding.StegoCarrierSet(densities[0]);
      try {
        request.carriers.forEach((carrier, index) => {
          const input = new binding.StegoInput(carrier.bytes, request.password);
          notices.push(input.metadataNotices());
          const job = binding.StegoJob.analyze(input, ROLE.original);
          try {
            const status = finish(job, (stage) => onProgress({ stage, file: index + 1 }));
            if (status !== "analyzed") throw unexpected(status);
            set.addAnalyzed(job);
          } finally {
            job.free();
            input.free();
          }
        });
        const rows = densities.map((density) => ({
          density,
          bytes: set.capacityBytes(density) ?? 0,
        }));
        return { rows, notices };
      } finally {
        set.free();
      }
    }
    const [carrier] = request.carriers;
    if (carrier === undefined) throw unexpected("failed");
    const analyzed = (password: string, role: string): number[] => {
      const input = new binding.StegoInput(carrier.bytes, password);
      try {
        if (notices.length === 0) notices.push(input.metadataNotices());
        const job = binding.StegoJob.analyze(input, role);
        try {
          const status = finish(job, (stage) => onProgress({ stage }));
          if (status !== "analyzed") throw unexpected(status);
          return densities.map((density) => job.capacityBytes(density));
        } finally {
          job.free();
        }
      } finally {
        input.free();
      }
    };
    if (request.decoyPassword === undefined) {
      const bytes = analyzed(request.password, ROLE.original);
      return {
        rows: densities.map((density, at) => ({ density, bytes: bytes[at] ?? 0 })),
        notices,
      };
    }
    // A decoy pair: the passwords are checked first, then each record's own space, the smaller.
    const pair = this.#pair(carrier, request.password, request.decoyPassword);
    if (!pair.accepted) return { rows: [], pair, notices };
    const behind = analyzed(request.password, ROLE.behind);
    const decoy = analyzed(request.decoyPassword, ROLE.decoy);
    const rows = densities.map((density, at) => ({
      density,
      bytes: Math.min(behind[at] ?? 0, decoy[at] ?? 0),
    }));
    return { rows, pair, notices };
  }

  /**
   * Writes the record into a new file (or a new set of files), then reads back the bytes of the
   * Blob the page will save and opens them with every password before handing the Blob over.
   */
  async hide(
    request: StegoHideRequest,
    onProgress: (progress: StegoProgress) => void,
  ): Promise<StegoHidden> {
    const binding = this.#binding;
    binding.checkStegoFileSizes(Float64Array.from(request.carriers, (c) => c.bytes.byteLength));
    const passwords = [request.password];
    let job: StegoJob;
    if (request.carriers.length > 1) {
      if (request.decoy !== undefined) throw unexpected("failed");
      const set = new binding.StegoCarrierSet(request.density);
      try {
        for (const carrier of request.carriers) set.add(carrier.bytes, request.password);
        const contents = contentOf(binding, request.contents);
        try {
          job = set.start(contents, request.quorum ?? request.carriers.length);
        } finally {
          contents.free();
        }
      } finally {
        set.free();
      }
    } else {
      const [carrier] = request.carriers;
      if (carrier === undefined) throw unexpected("failed");
      const input = new binding.StegoInput(carrier.bytes, request.password);
      const contents = contentOf(binding, request.contents);
      try {
        if (request.decoy === undefined) {
          job = binding.StegoJob.hide(input, contents, request.density);
        } else {
          passwords.push(request.decoy.password);
          const decoy = contentOf(binding, request.decoy.contents);
          try {
            job = binding.StegoJob.hideWithDecoy(
              input,
              contents,
              request.decoy.password,
              decoy,
              request.density,
            );
          } finally {
            decoy.free();
          }
        }
      } finally {
        contents.free();
        input.free();
      }
    }
    try {
      const status = finish(job, (stage) => onProgress({ stage }));
      if (status !== "verified") throw unexpected(status);
      const files: StegoWrittenFile[] = [];
      for (let index = 0; index < job.fileCount; index += 1) {
        const carrier = request.carriers[Math.min(index, request.carriers.length - 1)];
        const type = carrier?.type ?? "application/octet-stream";
        const written = job.bytes(index);
        const blob = new Blob([written as Uint8Array<ArrayBuffer>], { type });
        written.fill(0);
        // The Blob is what the page saves: its bytes are read back and opened with each password.
        const saved = new Uint8Array(await blob.arrayBuffer());
        try {
          for (const password of passwords) {
            const check = job.verifySaved(index, saved, password);
            try {
              const outcome = finish(check, (stage) =>
                onProgress({ stage, ...(job.fileCount > 1 ? { file: index + 1 } : {}) }),
              );
              if (outcome !== "saved-verified") throw unexpected(outcome);
            } finally {
              check.free();
            }
          }
        } finally {
          saved.fill(0);
        }
        files.push({
          blob,
          name: carrier?.name ?? `carrier-${String(index + 1).padStart(2, "0")}`,
          notices: job.fileMetadataNotices(index),
        });
      }
      return { files };
    } finally {
      job.free();
    }
  }

  /**
   * Opens what `password` opens in each file: a record of its own, or a member of a set, which a
   * quorum of the files recovers.
   */
  open(request: StegoOpenRequest, onProgress: (progress: StegoProgress) => void): StegoOpened {
    const binding = this.#binding;
    binding.checkStegoFileSizes(Float64Array.from(request.carriers, (c) => c.bytes.byteLength));
    const set = new binding.StegoRecoverySet();
    const empty: number[] = [];
    let members = 0;
    try {
      for (const [index, carrier] of request.carriers.entries()) {
        const input = new binding.StegoInput(carrier.bytes, request.password);
        const job = binding.StegoJob.open(input);
        try {
          const status = finish(job, (stage) =>
            onProgress({ stage, ...(request.carriers.length > 1 ? { file: index + 1 } : {}) }),
          );
          if (status === "no-record") {
            empty.push(index + 1);
            continue;
          }
          if (status !== "found") throw unexpected(status);
          const contents = job.takeContent();
          if (contents.filesNeeded() === 0) {
            // A record of its own: the first one opened is the answer.
            try {
              return this.#opened(contents);
            } finally {
              contents.free();
            }
          }
          set.add(contents);
          contents.free();
          members += 1;
        } finally {
          job.free();
          input.free();
        }
      }
      if (members === 0) return { kind: "no-record", files: empty };
      const recovered = set.recover();
      if (recovered === undefined)
        return { kind: "too-few", needed: set.filesNeeded(), available: members };
      try {
        return this.#opened(recovered);
      } finally {
        recovered.free();
      }
    } finally {
      set.wipe();
      set.free();
    }
  }

  #opened(contents: StegoContent): StegoOpened {
    const record = contents.backupRecord();
    if (record !== undefined) return { kind: "backup", record };
    const bytes = contents.opaqueBytes();
    if (bytes === undefined) throw unexpected("failed");
    return { kind: "opaque", bytes };
  }

  #pair(carrier: StegoCarrier, password: string, decoy: string): StegoPairCheck {
    const input = new this.#binding.StegoInput(carrier.bytes, password);
    try {
      const comparison = input.compareDecoyPassword(decoy);
      try {
        return {
          accepted: comparison.accepted,
          differencePercent: comparison.differencePercent,
          refusalCode: comparison.refusalCode,
        };
      } finally {
        comparison.free();
      }
    } finally {
      input.free();
    }
  }

  #densities(): string[] {
    using parameters = this.#binding.stegoParameters();
    return parameters.densities;
  }
}

/** Whether `cause` is MnemoCode's refusal of a steganography input or record. */
export function isStegoRefusal(cause: unknown): boolean {
  return errorCode(cause)?.startsWith("stego.") === true;
}
