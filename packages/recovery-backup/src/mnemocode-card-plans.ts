import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  plannedCardJob,
  separateCardJob,
  type CardJob,
} from "../../recovery-mnemocode/source/export/render.js";
import {
  isCardPageSize,
  type CardOrientation,
} from "../../recovery-mnemocode/source/export/card-settings.js";
import type { CardContent } from "../../recovery-mnemocode/source/export/backup-cards.js";
import type { CardDrawing } from "../../recovery-mnemocode/source/export/templates.js";
import { ownCards } from "../../recovery-mnemocode/source/export/card-decoys.js";

interface DecoyTail {
  readonly colors: readonly string[];
  readonly labels?: readonly string[];
  readonly orientation?: CardOrientation;
}
const key = (value: unknown): string =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(value))));

function sourceKey(job: CardJob): string {
  // Page shape/QR/orientation alter geometry, not the real codes or the first existing decoy.
  const {
    pageSize: _size,
    orientation: _orientation,
    cardQr: _qr,
    decoys: _decoys,
    ...source
  } = job.content;
  const own = ownCards(job.content);
  return key([
    job.template.id,
    {
      ...source,
      colors: source.colors.slice(0, own),
      ...(source.labels === undefined ? {} : { labels: source.labels.slice(0, own) }),
    },
  ]);
}

function tailOf(content: CardContent, own: number): DecoyTail | undefined {
  if (content.decoys === undefined) return undefined;
  return {
    colors: content.colors.slice(own),
    ...(content.labels === undefined ? {} : { labels: content.labels.slice(own) }),
    ...(content.orientation === undefined ? {} : { orientation: content.orientation }),
  };
}

function extended(content: CardContent, tail: DecoyTail): CardContent {
  return {
    ...content,
    colors: [...content.colors, ...tail.colors],
    ...(content.labels === undefined || tail.labels === undefined
      ? {}
      : { labels: [...content.labels, ...tail.labels] }),
    decoys: tail.colors.length,
    ...(tail.orientation === undefined ? {} : { orientation: tail.orientation }),
  };
}

/** Owns only decoy tails and source hashes; conversions never retain a second real-code plan. */
export class MnemoCodeCardPlans {
  readonly #drawing: CardDrawing;
  readonly #layouts = new Map<string, DecoyTail>();
  readonly #sheets = new Map<string, DecoyTail>();

  constructor(drawing: CardDrawing) {
    this.#drawing = drawing;
  }

  /** Reuses a layout, or converts a prepared sheet via the library without another random pool. */
  async plan(job: CardJob): Promise<CardJob> {
    const own = ownCards(job.content);
    const layout = key([job.template.id, job.content]);
    const known = this.#layouts.get(layout);
    if (known !== undefined) return { ...job, content: extended(job.content, known) };
    const source = sourceKey(job);
    const sheet = this.#sheets.get(source);
    if (isCardPageSize(job.content.pageSize) && sheet !== undefined) {
      const converted = separateCardJob(
        { ...job, content: extended(job.content, sheet) },
        job.content.orientation,
      );
      const tail = tailOf(converted.content, own);
      if (tail !== undefined) this.#layouts.set(layout, tail);
      return converted;
    }
    const planned = await plannedCardJob(this.#drawing, job);
    const tail = tailOf(planned.content, own);
    if (tail !== undefined) {
      this.#layouts.set(layout, tail);
      if (!isCardPageSize(job.content.pageSize)) this.#sheets.set(source, tail);
    }
    return planned;
  }

  /** Source changes, clear and page disposal drop every retained plan reference. */
  wipe(): void {
    this.#layouts.clear();
    this.#sheets.clear();
  }

  [Symbol.dispose](): void {
    this.wipe();
  }
}
