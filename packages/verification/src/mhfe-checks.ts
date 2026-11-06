import type {
  MhfeComponentResult,
  MhfeSelfCheckProgress,
  MhfeSelfCheckReport,
} from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";

/** An independent browser class that the host checks before offering its operations. */
export type MhfeClassName = "Core" | "Repair words" | "Passwords" | "Wallet";

/** A class's package-owned report, with the name used by its host. */
export interface MhfeClassReport {
  /** The class checked. */
  readonly name: MhfeClassName;
  /** The package's full verdict, including limitations and failed components. */
  readonly report: MhfeSelfCheckReport;
}

/** The package check operations supplied by a browser-class adapter. */
export interface MhfeClassChecks {
  /** The class these operations check. */
  readonly name: MhfeClassName;
  /** The bounded startup checks; the package owns their implementation. */
  quick(): Promise<MhfeSelfCheckReport>;
  /** The full checks; the package supplies progress and the final verdict. */
  full(onProgress: (progress: MhfeSelfCheckProgress) => void): Promise<MhfeSelfCheckReport>;
}

/** Ordered package checks and the shared interpretation of a confirmed wrong answer. */
export class MhfeCheckSequence {
  /** Checks selected classes before use, stopping at a wrong answer; service errors propagate. */
  static startup(
    checks: readonly MhfeClassChecks[],
    only?: readonly MhfeClassName[],
  ): Promise<MhfeClassReport[]> {
    return MhfeCheckSequence.#run(checks, "quick", undefined, only);
  }

  /** Checks classes in order, stopping at a wrong answer; operational service errors propagate. */
  static full(
    checks: readonly MhfeClassChecks[],
    onProgress?: (name: string, progress: MhfeSelfCheckProgress) => void,
  ): Promise<MhfeClassReport[]> {
    return MhfeCheckSequence.#run(checks, "full", onProgress);
  }

  /** Warnings, unavailable parts and unrun parts are distinct from failed known answers. */
  static failedComponents(report: MhfeSelfCheckReport): readonly MhfeComponentResult[] {
    return report.components.filter((part) => MhfeCheckSequence.failedComponent(part));
  }

  /** A completed component's wrong answer is authoritative before the final report arrives. */
  static failedComponent(part: Pick<MhfeComponentResult, "outcome">): boolean {
    return part.outcome === "failed";
  }

  /** Both the aggregate verdict and every component must be free of a known-answer failure. */
  static passed(report: MhfeSelfCheckReport): boolean {
    return report.passed && MhfeCheckSequence.failedComponents(report).length === 0;
  }

  static async #run(
    checks: readonly MhfeClassChecks[],
    kind: "quick" | "full",
    onProgress?: (name: string, progress: MhfeSelfCheckProgress) => void,
    only?: readonly MhfeClassName[],
  ): Promise<MhfeClassReport[]> {
    const reports: MhfeClassReport[] = [];
    for (const part of checks) {
      if (only !== undefined && !only.includes(part.name)) continue;
      const report =
        kind === "quick"
          ? await part.quick()
          : await part.full((progress) => onProgress?.(part.name, progress));
      reports.push({ name: part.name, report });
      // A later unavailable worker must never replace an already confirmed wrong answer.
      if (!MhfeCheckSequence.passed(report)) break;
    }
    return reports;
  }
}
