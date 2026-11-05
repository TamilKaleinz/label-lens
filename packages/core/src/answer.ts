/**
 * Answer pipeline (architecture doc 3.1): resolve → [safety, M3] → retrieve → generate → check → compose.
 *
 * Every early exit fails closed: a label that isn't resolved, a format v1 doesn't answer from, a
 * model error or a reply with no surviving claim never becomes an answer. Every response carries
 * the label it came from and the config hash.
 *
 * The safety classifier (step 2) is built in M3. Until then `checks.safety` is "not_built", and
 * the API must not be exposed publicly.
 */
import type { Config } from "./config.js";
import { excerptsFor, generate } from "./generate.js";
import type { ModelClient } from "./model.js";
import { resolve, type LabelStore } from "./resolve.js";
import { LabelIndex } from "./retrieve.js";
import type { Section } from "../../ingest/src/sections.js";
import { supportCheck } from "./support.js";
import type { LabelMeta, LabelRef, ResolveResult, Role } from "./types.js";
import { verifyClaims, type DropReason } from "./verify.js";

export interface LabelHeader {
  setId: string;
  version: string;
  splId: string;
  manufacturer: string;
  effectiveDate: string;
  brand: string;
  /** True when a pharmacist got the group's representative label (badge + switch in the UI). */
  representative: boolean;
}

export interface CitedClaim {
  text: string;
  sectionCode: string;
  sectionTitle: string;
  quote: string;
  chunkId: string;
  start: number;
  end: number;
}

export type AnswerResponse = {
  configHash: string;
  checks: { safety: "not_built"; quote: "on"; support: "on" | "off" };
} & (
  | { kind: "clarify"; choice: Extract<ResolveResult, { status: "needs_choice" }> }
  | { kind: "not_found"; message: string }
  | { kind: "unsupported_format"; label: LabelHeader; message: string }
  | {
      kind: "answer" | "label_silent";
      label: LabelHeader;
      claims: CitedClaim[];
      /** Present on every response from a label with a Boxed Warning (FR-F03-04). */
      boxedWarning: { present: boolean; cited: boolean };
      dropped: { count: number; reasons: DropReason[] };
      intents: string[];
      /** Set when the model failed or replied out of schema; the user sees the label-silent pattern. */
      error?: string;
    }
);

export interface EngineDeps {
  store: LabelStore;
  /** The full sections of a label version (from Postgres in production, fixtures in tests). */
  sectionsFor: (label: LabelMeta) => Section[];
  model: ModelClient;
  config: Config;
  /** Turn the model-based support check off, for runs without a gate model. Default on. */
  supportCheck?: boolean;
}

const header = (l: LabelMeta, representative: boolean): LabelHeader => ({
  setId: l.setId, version: l.version, splId: l.splId, manufacturer: l.manufacturer,
  effectiveDate: l.effectiveDate, brand: l.brandNames[0] ?? l.genericNames[0] ?? "", representative,
});

export class Engine {
  private readonly indexes = new Map<string, LabelIndex>();
  constructor(private readonly deps: EngineDeps) {}

  private index(l: LabelMeta): LabelIndex {
    const key = `${l.setId}@${l.version}`;
    let ix = this.indexes.get(key);
    if (!ix) {
      ix = new LabelIndex(this.deps.sectionsFor(l), this.deps.config.retrieval);
      this.indexes.set(key, ix);
    }
    return ix;
  }

  async answer(req: { role: Role; ref: LabelRef; question: string }): Promise<AnswerResponse> {
    const { config, model, store } = this.deps;
    const useSupport = this.deps.supportCheck !== false;
    const base = { configHash: config.hash, checks: { safety: "not_built", quote: "on", support: useSupport ? "on" : "off" } } as const;

    // 1. Resolve the label (rules only).
    const r = resolve(store, req.ref, req.role);
    if (r.status === "needs_choice") return { ...base, kind: "clarify", choice: r };
    if (r.status === "not_found") return { ...base, kind: "not_found", message: r.message };
    if (r.status === "unsupported_format") return { ...base, kind: "unsupported_format", label: header(r.label, false), message: r.message };
    const label = r.label;
    const head = header(label, r.representative);

    // 2. Safety classifier: M3.

    // 3. Retrieve from this label version only.
    const retrieval = this.index(label).search(req.question, config.retrieval.k);
    const excerpts = excerptsFor(retrieval);
    const bwPresent = label.hasBoxedWarning;
    const silent = (error?: string, dropped: DropReason[] = []) => ({
      ...base, kind: "label_silent" as const, label: head, claims: [],
      boxedWarning: { present: bwPresent, cited: false }, dropped: { count: dropped.length, reasons: dropped },
      intents: retrieval.intents, ...(error ? { error } : {}),
    });
    // Nothing in the label matched: label-silent, without asking the model. The Boxed Warning is
    // never sent alone, or an unrelated question could be "answered" from it.
    if (retrieval.chunks.length === 0) return silent();

    // 4. Generate claims with quotes.
    const g = await generate(model, config, req.role, req.question, label, excerpts);
    if (!g.ok) return silent(g.error);
    if (g.labelSilent) return silent();

    // 5. Check every claim; drop, never rewrite.
    const v = await verifyClaims(g.claims, excerpts, useSupport ? supportCheck(model, config) : undefined);
    const reasons = v.dropped.map((d) => d.reason);
    if (v.outcome === "label_silent") return silent(undefined, reasons);

    // 6. Compose.
    const byId = new Map(excerpts.map((c) => [c.id, c]));
    const claims: CitedClaim[] = v.kept.map((k) => ({
      text: k.text, sectionCode: k.sectionCode, sectionTitle: byId.get(k.location.chunkId)?.sectionTitle ?? "",
      quote: k.quote, chunkId: k.location.chunkId, start: k.location.start, end: k.location.end,
    }));
    return {
      ...base, kind: "answer", label: head, claims,
      boxedWarning: { present: bwPresent, cited: claims.some((c) => c.sectionCode === "BW") },
      dropped: { count: reasons.length, reasons }, intents: retrieval.intents,
    };
  }
}
