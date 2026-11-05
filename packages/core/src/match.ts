/**
 * Name matching for the label resolver (FR-F01-01): brand or generic name, tolerant of common
 * misspellings, plus optional dosage-form and release hints in the query ("Ozempic tablets").
 */
import type { DosageForm, LabelMeta, Release } from "./types.js";

export interface ParsedQuery {
  nameTokens: string[];
  dosageForm?: DosageForm;
  release?: Release;
}

const STOP = new Set(["and", "with", "the", "of", "for", "usp", "hcl", "mg"]);

export function parseQuery(q: string): ParsedQuery {
  let t = ` ${q.toLowerCase().replace(/[^a-z0-9\s-]/g, " ")} `;
  const out: ParsedQuery = { nameTokens: [] };
  const take = (re: RegExp) => {
    const hit = re.test(t);
    if (hit) t = t.replace(re, " ");
    return hit;
  };
  if (take(/\bextended[- ]release\b|\bxr\b|\ber\b/g)) out.release = "ER";
  else if (take(/\bdelayed[- ]release\b|\bdr\b/g)) out.release = "DR";
  else if (take(/\bimmediate[- ]release\b|\bir\b/g)) out.release = "IR";
  if (take(/\boral solution\b|\bsolution\b|\bliquid\b/g)) out.dosageForm = "oral_solution";
  else if (take(/\binjections?\b|\binjectable\b|\bpens?\b/g)) out.dosageForm = "injection";
  else if (take(/\btablets?\b/g)) out.dosageForm = "tablet";
  else if (take(/\bcapsules?\b/g)) out.dosageForm = "capsule";
  take(/\boral\b/g);
  out.nameTokens = t.split(/[\s-]+/).filter((w) => w.length > 1 && !STOP.has(w));
  return out;
}

/** Levenshtein distance, small and exact; used only for tokens of 6+ letters. */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) (d[0] as number[])[j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const row = d[i] as number[], prev = d[i - 1] as number[];
      row[j] = Math.min((prev[j] as number) + 1, (row[j - 1] as number) + 1, (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return (d[a.length] as number[])[b.length] as number;
}

function tokenMatches(token: string, words: string[]): boolean {
  return words.some(
    (w) => w === token || (token.length >= 4 && w.startsWith(token)) || (token.length >= 6 && Math.abs(w.length - token.length) <= 1 && editDistance(token, w) <= 1),
  );
}

export function labelMatchesName(label: LabelMeta, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const words = [...label.brandNames, ...label.genericNames, ...label.substances]
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.every((t) => tokenMatches(t, words));
}
