/**
 * Answer pipeline (architecture doc 3.1): safety → resolve → retrieve → generate → check → compose.
 *
 * 1. The safety classifier sees the question only (never the role) and runs first, so an emergency
 *    gets help before anything else, even before the product is known.
 * 2. Every early exit fails closed: an unresolved label, an unsupported format, a model error or a
 *    reply with no surviving claim never becomes an answer.
 * 3. A refusal shows the label's own words, quoted verbatim, and never model-written text. A
 *    grounded "No, stop taking it" is still personal advice; quotes alone can't be.
 *
 * Every response carries the safety class, the label it came from and the config hash.
 */
import type { Config, RefusalCopyKey } from "./config.js";
import { excerptsFor, generate } from "./generate.js";
import type { ModelClient } from "./model.js";
import { resolve, type LabelStore } from "./resolve.js";
import { LabelIndex, type Chunk, type Retrieval } from "./retrieve.js";
import type { Section } from "../../ingest/src/sections.js";
import { SafetyCache, type SafetyClass, type SafetyVerdict } from "./safety.js";
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

/** Verbatim label text with where it sits, for highlighting in the label pane. */
export interface LabelQuote {
  sectionCode: string;
  sectionTitle: string;
  quote: string;
  chunkId: string;
  start: number;
  end: number;
}

export interface CitedClaim extends LabelQuote {
  text: string;
}

interface Guidance {
  /** User-facing copy from config/refusals.json. */
  message: string;
  /** The human to ask (FR-F04-04). */
  askHuman: string;
}

interface LabelBlock {
  label: LabelHeader;
  /** Present on every response from a label with a Boxed Warning (FR-F03-04). */
  boxedWarning: { present: boolean; cited: boolean };
}

export type AnswerResponse = {
  configHash: string;
  safety: { class: SafetyClass; by: SafetyVerdict["by"] };
  checks: { quote: "on"; support: "on" | "off" };
} & (
  | ({ kind: "emergency" } & Guidance)
  | { kind: "clarify"; choice: Extract<ResolveResult, { status: "needs_choice" }> }
  | { kind: "not_found"; message: string }
  | { kind: "unsupported_format"; label: LabelHeader; message: string }
  | ({ kind: "refusal"; refusal: "personal_advice" | "out_of_scope"; labelQuotes: LabelQuote[] } & Guidance & LabelBlock)
  | ({ kind: "clarify_question"; options: string[] } & Guidance & LabelBlock)
  | ({
      kind: "answer";
      claims: CitedClaim[];
      dropped: { count: number; reasons: DropReason[] };
      intents: string[];
    } & LabelBlock)
  | ({
      kind: "label_silent";
      claims: [];
      dropped: { count: number; reasons: DropReason[] };
      intents: string[];
      /** Set when the model failed or replied out of schema; the user sees the label-silent pattern. */
      error?: string;
    } & Guidance & LabelBlock)
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

/** The opening sentences of a chunk, verbatim, as a quote (used for Indications on out-of-scope questions). */
function leadQuote(c: Chunk, maxChars = 400): LabelQuote {
  const sentences = c.text.split(/(?<=\.)\s+(?=[A-Z])/);
  let end = 0;
  for (const s of sentences) {
    const next = c.text.indexOf(s, end) + s.length;
    if (end > 0 && next > maxChars) break;
    end = next;
  }
  return { sectionCode: c.sectionCode, sectionTitle: c.sectionTitle, quote: c.text.slice(0, end), chunkId: c.id, start: 0, end };
}

export class Engine {
  private readonly indexes = new Map<string, LabelIndex>();
  private readonly safety = new SafetyCache();
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

  /** Generate, then check every claim; drop, never rewrite. */
  private async claimsFor(role: Role, question: string, label: LabelMeta, retrieval: Retrieval) {
    const { config, model } = this.deps;
    const excerpts = excerptsFor(retrieval);
    const g = await generate(model, config, role, question, label, excerpts);
    if (!g.ok) return { claims: [] as CitedClaim[], reasons: [] as DropReason[], error: g.error };
    if (g.labelSilent) return { claims: [] as CitedClaim[], reasons: [] as DropReason[] };
    const v = await verifyClaims(g.claims, excerpts, this.deps.supportCheck !== false ? supportCheck(model, config) : undefined);
    const byId = new Map(excerpts.map((c) => [c.id, c]));
    const claims: CitedClaim[] = v.kept.map((k) => ({
      text: k.text, sectionCode: k.sectionCode, sectionTitle: byId.get(k.location.chunkId)?.sectionTitle ?? "",
      quote: k.quote, chunkId: k.location.chunkId, start: k.location.start, end: k.location.end,
    }));
    return { claims, reasons: v.dropped.map((d) => d.reason) };
  }

  async answer(req: { role: Role; ref: LabelRef; question: string }): Promise<AnswerResponse> {
    const { config, model, store } = this.deps;
    const copy = (k: RefusalCopyKey): Guidance => config.refusals[k];

    // 1. Safety, from the question alone. Fixed here; nothing later can upgrade a refusal.
    const verdict = await this.safety.classify(req.question, model, config);
    const base = {
      configHash: config.hash,
      safety: { class: verdict.class, by: verdict.by },
      checks: { quote: "on", support: this.deps.supportCheck !== false ? "on" : "off" },
    } as const;
    if (verdict.class === "emergency") return { ...base, kind: "emergency", ...copy("emergency") };

    // 2. Resolve the label (rules only).
    const r = resolve(store, req.ref, req.role);
    if (r.status === "needs_choice") return { ...base, kind: "clarify", choice: r };
    if (r.status === "not_found") return { ...base, kind: "not_found", message: r.message };
    if (r.status === "unsupported_format") return { ...base, kind: "unsupported_format", label: header(r.label, false), message: r.message };
    const label = r.label;
    const block = { label: header(label, r.representative), boxedWarning: { present: label.hasBoxedWarning, cited: false } };

    // 3. Retrieve from this label version only.
    const index = this.index(label);
    const retrieval = index.search(req.question, config.retrieval.k);

    // 4. Refusals and the low-confidence path.
    if (verdict.class === "out_of_scope") {
      const indications = index.chunks.filter((c) => /^1(\.|$)/.test(c.sectionCode)).slice(0, 2).map((c) => leadQuote(c));
      return { ...base, kind: "refusal", refusal: "out_of_scope", labelQuotes: indications, ...copy("out_of_scope"), ...block };
    }
    if (verdict.class === "personal_advice") {
      // Verified quotes only. The model's claim text is discarded: it may answer the personal question.
      const { claims } = retrieval.chunks.length ? await this.claimsFor(req.role, req.question, label, retrieval) : { claims: [] };
      const labelQuotes = claims.map(({ text: _t, ...q }) => q);
      const boxedWarning = { ...block.boxedWarning, cited: labelQuotes.some((q) => q.sectionCode === "BW") };
      return { ...base, kind: "refusal", refusal: "personal_advice", labelQuotes, ...copy("personal_advice"), ...block, boxedWarning };
    }
    if (verdict.class === "low_confidence") {
      const titles = [...new Set(retrieval.chunks.map((c) => `${c.sectionCode} ${c.sectionTitle}`))].slice(0, 2);
      const g = copy("low_confidence");
      const message = titles.length === 2 ? `${g.message} Do you mean ${titles[0]}, or ${titles[1]}?` : g.message;
      return { ...base, kind: "clarify_question", options: titles, message, askHuman: g.askHuman, ...block };
    }

    // 5. Answerable: generate, check, compose.
    const silent = (error?: string, reasons: DropReason[] = []) => ({
      ...base, kind: "label_silent" as const, claims: [] as [], dropped: { count: reasons.length, reasons },
      intents: retrieval.intents, ...copy("label_silent"), ...block, ...(error ? { error } : {}),
    });
    // Nothing in the label matched: label-silent, without asking the model. The Boxed Warning is
    // never sent alone, or an unrelated question could be "answered" from it.
    if (retrieval.chunks.length === 0) return silent();
    const { claims, reasons, error } = await this.claimsFor(req.role, req.question, label, retrieval);
    if (claims.length === 0) return silent(error, reasons);
    return {
      ...base, kind: "answer", claims, dropped: { count: reasons.length, reasons }, intents: retrieval.intents,
      ...block, boxedWarning: { ...block.boxedWarning, cited: claims.some((c) => c.sectionCode === "BW") },
    };
  }
}
