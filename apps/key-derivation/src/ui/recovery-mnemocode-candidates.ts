// What a MnemoCode search found: a summary in the command line's words, a table of the candidates
// (number, what was found, the wallet's answer), and the phrase of a candidate the person picks.
// Phrases are never listed together and never copied in bulk: only one chosen candidate is shown.
import { downloadBlob } from "@ckd/export/download.js";
import { fingerprintWithoutPassphrase } from "@ckd/recovery-backup/fingerprint.js";
import {
  NO_CANDIDATE_TO_SAVE,
  type CandidateListFile,
  type ListOutcome,
  type SearchOutcome,
  type ShownCandidate,
} from "@ckd/recovery-backup/mnemocode-search.js";
import {
  paragraph,
  renderRecoveredMnemonic,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

/** Every row gets a Use button when there are at most this many; otherwise only matched rows. */
const USE_ALL_ROWS_UP_TO = 16;
/** File names of a candidate list, as MnemoCode's command line suggests them. */
const ENCRYPTED_LIST_NAME = "candidates.age";
const PLAIN_LIST_NAME = "candidates.mncl";

export interface CandidateView {
  /** "Words" for a word search, "Dates" for a date search. */
  readonly foundLabel: string;
  /** What the wallet was compared with, such as "the fingerprint"; undefined without a check. */
  readonly evidence: string | undefined;
  /** The wallet's BIP39 passphrase, passed on with a phrase used in Generate & Derive. */
  readonly passphrase: string;
}

const grouped = (count: number): string => count.toLocaleString("en-US");

/** Why no candidate list was written although one was asked for; nothing otherwise. */
function listNote(outcome: ListOutcome): HTMLElement[] {
  if (outcome.listFull)
    return [
      paragraph(
        "More candidates than one list holds, so no list was written: give more of the words, or a few letters of them.",
        "warning-callout",
      ),
    ];
  if (outcome.listEmpty) return [paragraph(NO_CANDIDATE_TO_SAVE, "field-note")];
  return [];
}

/** The summary lines, from MnemoCode's command line. */
function summary(outcome: SearchOutcome, view: CandidateView): HTMLElement[] {
  if (outcome.count === 0)
    return [
      paragraph(
        "No valid phrase fits: check the words or dates, their order and the ? places.",
        "warning-callout",
      ),
      ...listNote(outcome),
    ];
  const lines: HTMLElement[] = [];
  if (view.evidence === undefined)
    lines.push(
      paragraph(
        `${grouped(outcome.count)} candidates. A valid checksum does not prove the wallet: compare an address.`,
        "warning-callout",
      ),
    );
  else
    lines.push(
      paragraph(
        `Matched ${grouped(outcome.matched)} of ${grouped(outcome.count)} candidates against ${view.evidence} locally.`,
        outcome.matched > 0 ? "success-callout" : "warning-callout",
      ),
    );
  if (outcome.warning !== undefined) lines.push(paragraph(outcome.warning, "field-note"));
  if (outcome.shown.length < outcome.count)
    lines.push(
      paragraph(
        `The table shows ${grouped(outcome.shown.length)} of ${grouped(outcome.count)} candidates.`,
        "field-note",
      ),
    );
  lines.push(...listNote(outcome));
  return lines;
}

function cell(text: string, className?: string): HTMLTableCellElement {
  const element = document.createElement("td");
  element.textContent = text;
  if (className !== undefined) element.className = className;
  return element;
}

/** The wallet column: where a candidate matched; the master key itself has no path to show. */
function walletAnswer(candidate: ShownCandidate): string {
  if (candidate.matched !== true) return "no";
  return candidate.path === undefined || candidate.path === "m"
    ? "matches"
    : `matches at ${candidate.path}`;
}

/** Shows a search's result; Use shows one phrase with its fingerprint below the table. */
export function renderCandidates(
  target: HTMLElement,
  outcome: SearchOutcome,
  view: CandidateView,
  context: RecoveryFeatureContext,
): void {
  target.replaceChildren(...summary(outcome, view));
  if (outcome.shown.length === 0) return renderCandidateListSave(target, outcome.list);
  const chosen = document.createElement("div");
  chosen.className = "mnemocode-chosen-candidate";
  const table = document.createElement("table");
  table.className = "candidate-table";
  const head = document.createElement("tr");
  for (const title of [
    "Candidate",
    view.foundLabel,
    ...(view.evidence === undefined ? [] : ["Wallet"]),
    "",
  ]) {
    const header = document.createElement("th");
    header.textContent = title;
    head.append(header);
  }
  const body = document.createElement("tbody");
  const useAll = outcome.shown.length <= USE_ALL_ROWS_UP_TO;
  for (const candidate of outcome.shown) {
    const row = document.createElement("tr");
    // What was found is part of a seed phrase: it is shown with the table's own Show button.
    row.append(cell(grouped(candidate.number)), cell(candidate.found, "concealed candidate-found"));
    if (view.evidence !== undefined) row.append(cell(walletAnswer(candidate)));
    const action = document.createElement("td");
    if (useAll || candidate.matched === true)
      action.append(useButton(candidate, chosen, view, context));
    row.append(action);
    body.append(row);
  }
  const header = document.createElement("thead");
  header.append(head);
  table.append(header, body);
  const reveal = document.createElement("button");
  reveal.type = "button";
  reveal.className = "danger-outline compact";
  reveal.textContent = `Show ${view.foundLabel.toLowerCase()}`;
  reveal.addEventListener("click", () => {
    const shown = reveal.getAttribute("aria-pressed") !== "true";
    for (const found of table.querySelectorAll(".candidate-found"))
      found.classList.toggle("concealed", !shown);
    reveal.textContent = `${shown ? "Hide" : "Show"} ${view.foundLabel.toLowerCase()}`;
    reveal.setAttribute("aria-pressed", String(shown));
  });
  const wrapper = document.createElement("div");
  wrapper.className = "candidate-table-wrapper";
  wrapper.append(table);
  target.append(reveal, wrapper, chosen);
  renderCandidateListSave(target, outcome.list);
}

function useButton(
  candidate: ShownCandidate,
  chosen: HTMLElement,
  view: CandidateView,
  context: RecoveryFeatureContext,
): HTMLButtonElement {
  const use = document.createElement("button");
  use.type = "button";
  use.className = "secondary compact";
  use.textContent = "Use";
  use.setAttribute("aria-label", `Use candidate ${candidate.number}`);
  use.addEventListener("click", () => {
    const heading = document.createElement("h3");
    heading.textContent = `Candidate ${grouped(candidate.number)}`;
    chosen.replaceChildren(
      heading,
      paragraph(
        `Fingerprint ${fingerprintWithoutPassphrase(candidate.phrase, context.mnemonicToSeed)} (BIP32 master key ` +
          "fingerprint for an empty BIP39 passphrase). It does not reveal the phrase.",
        "field-note",
      ),
    );
    renderRecoveredMnemonic(
      chosen,
      candidate.phrase,
      context.writeClipboard,
      (phrase) =>
        context.useMnemonicInDeriver(phrase, view.passphrase === "" ? undefined : view.passphrase),
      context.mnemonicToSeed,
      view.passphrase,
    );
  });
  return use;
}

/**
 * The button that saves the candidate list a worker wrote, and its note; nothing without a list.
 * `item` names what the result numbers, "Candidate" for a search or "Phrase" for a share restore:
 * item N there is record N of the list.
 */
export function renderCandidateListSave(
  target: HTMLElement,
  list: CandidateListFile | undefined,
  item = "Candidate",
): void {
  if (list === undefined) return;
  const name = list.encrypted ? ENCRYPTED_LIST_NAME : PLAIN_LIST_NAME;
  const save = document.createElement("button");
  save.type = "button";
  save.className = "secondary compact";
  save.textContent = "Save candidate list";
  save.addEventListener("click", () => {
    // A Blob copies its parts; the list itself is wiped at once, also if the download is cancelled,
    // since without encryption it holds every candidate's entropy (MnemoCode CandidateListFile).
    try {
      downloadBlob(new Blob([list.bytes], { type: "application/octet-stream" }), name);
    } finally {
      list.bytes.fill(0);
      save.disabled = true;
      save.textContent = "Candidate list saved";
    }
  });
  target.append(
    save,
    paragraph(
      `${name}: ${grouped(list.records)} candidates, ${list.description}. ${item} N here is record N of ` +
        "the list. Your browser saves into its download folder; if a cloud service synchronises that " +
        "folder, the file is copied there too.",
      "field-note",
    ),
  );
}
