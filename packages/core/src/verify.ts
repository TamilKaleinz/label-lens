/**
 * Claim checker (architecture doc 4.4.6; guardrail GM-01: no unsupported claim is shown).
 *
 * The generator returns claims, each with the section it cites and a quote from that section.
 * Step 1, here, is deterministic: a claim survives only if
 *   1. its quote appears in a retrieved chunk of the section it cites (a wrong section fails),
 *   2. the quote is long enough to carry meaning (not "may" or "renal"),
 *   3. every number in the claim also appears in its quote ("cut to 1 g" needs a quote that says 1 g).
 * Step 2, the support check, asks a small model whether the quote supports the claim's wording.
 * It is optional here and plugged in by the caller, so this module never calls a model itself.
 *
 * Failing claims are dropped, never rewritten. If none survive, the answer becomes label-silent.
 */
import type { Chunk } from "./retrieve.js";

export interface Claim {
  text: string;
  sectionCode: string;
  quote: string;
}

export interface Located {
  chunkId: string;
  /** Character offsets of the quote inside the chunk text, for highlighting in the evidence panel. */
  start: number;
  end: number;
}

export type DropReason = "quote_not_found" | "wrong_section" | "quote_too_short" | "number_not_in_quote" | "unsupported";

export interface Verdict {
  kept: (Claim & { location: Located })[];
  dropped: (Claim & { reason: DropReason })[];
  outcome: "answer" | "label_silent";
}

/** Small-model support check: does the quote support the claim as worded? */
export type SupportCheck = (claim: Claim) => Promise<boolean>;

const MIN_QUOTE_CHARS = 20;
const MIN_QUOTE_WORDS = 3;

/**
 * Canonical form for matching: lowercase, typographic quotes and dashes made plain, and all
 * whitespace removed. Labels in openFDA contain spacing artefacts ("1.73 m 2", "B 12") that a
 * faithful quote may not reproduce. Returns the form plus, for each of its characters, the index
 * in the original text, so a match can be mapped back to offsets.
 */
export function canonical(s: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let ch = s[i] as string;
    if (/\s/.test(ch)) continue;
    if (/[‘’‛′]/.test(ch)) ch = "'";
    else if (/[“”″]/.test(ch)) ch = '"';
    else if (/[‐‑‒–—−]/.test(ch)) ch = "-";
    text += ch.toLowerCase();
    map.push(i);
  }
  return { text, map };
}

/** Numbers as written: "2.5", "1,000" → "1000", "48". */
export function numbersIn(s: string): string[] {
  return [...s.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, ""));
}

function locate(quote: string, chunks: Chunk[]): Located | undefined {
  const q = canonical(quote).text;
  if (!q) return undefined;
  for (const c of chunks) {
    const t = canonical(c.text);
    const at = t.text.indexOf(q);
    if (at >= 0) return { chunkId: c.id, start: t.map[at] as number, end: (t.map[at + q.length - 1] as number) + 1 };
  }
  return undefined;
}

/** Deterministic checks only (step 1). */
export function checkQuote(claim: Claim, chunks: Chunk[]): { ok: true; location: Located } | { ok: false; reason: DropReason } {
  const words = claim.quote.trim().split(/\s+/).filter(Boolean);
  if (claim.quote.trim().length < MIN_QUOTE_CHARS || words.length < MIN_QUOTE_WORDS) return { ok: false, reason: "quote_too_short" };
  const inCited = locate(claim.quote, chunks.filter((c) => c.sectionCode === claim.sectionCode));
  if (!inCited) return { ok: false, reason: locate(claim.quote, chunks) ? "wrong_section" : "quote_not_found" };
  const quoteNums = new Set(numbersIn(claim.quote));
  if (numbersIn(claim.text).some((n) => !quoteNums.has(n))) return { ok: false, reason: "number_not_in_quote" };
  return { ok: true, location: inCited };
}

/**
 * Verifies every claim against the chunks the generator was given (the retrieved chunks plus the
 * Boxed Warning). Pass `support` to run step 2 on the claims that survive step 1.
 */
export async function verifyClaims(claims: Claim[], chunks: Chunk[], support?: SupportCheck): Promise<Verdict> {
  const kept: Verdict["kept"] = [];
  const dropped: Verdict["dropped"] = [];
  for (const c of claims) {
    const r = checkQuote(c, chunks);
    if (!r.ok) {
      dropped.push({ ...c, reason: r.reason });
      continue;
    }
    if (support && !(await support(c))) {
      dropped.push({ ...c, reason: "unsupported" });
      continue;
    }
    kept.push({ ...c, location: r.location });
  }
  return { kept, dropped, outcome: kept.length > 0 ? "answer" : "label_silent" };
}
