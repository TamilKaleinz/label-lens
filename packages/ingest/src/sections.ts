/**
 * Section and subsection splitting (architecture doc 4.4.1, steps 3 and 4).
 * openFDA gives one text field per top-level section. Some fields begin with the label's
 * Highlights summary (e.g. "Lactic Acidosis: See boxed warning. ( 5.1 )") before the full text.
 * That summary is removed, then the full text is split on numbered headings like "5.3 Hepatic Injury".
 */
import { createHash } from "node:crypto";

export interface Section {
  /** "BW", a section number ("5") or a subsection number ("5.3"). */
  code: string;
  title: string;
  kind: "boxed" | "section" | "subsection";
  text: string;
  textHash: string;
}

/** openFDA field name -> PLR section number. */
export const FIELD_TO_SECTION: Record<string, string> = {
  indications_and_usage: "1",
  dosage_and_administration: "2",
  dosage_forms_and_strengths: "3",
  contraindications: "4",
  warnings_and_cautions: "5",
  adverse_reactions: "6",
  drug_interactions: "7",
  use_in_specific_populations: "8",
  overdosage: "10",
  description: "11",
  clinical_pharmacology: "12",
  nonclinical_toxicology: "13",
  clinical_studies: "14",
  how_supplied: "16",
  information_for_patients: "17",
};

export const hashText = (s: string): string =>
  createHash("sha256").update(s.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);

/**
 * Removes a Highlights-style summary from the start of a section field: the text between the
 * section heading and the first real subsection heading `N.1 Title`, when that text cites
 * subsections in parentheses, e.g. "( 5.1 )".
 */
export function stripHighlights(text: string, sectionNo: string): string {
  const heading = new RegExp(`\\b${sectionNo}\\.1\\s+[A-Z]`);
  const m = heading.exec(text);
  if (!m || m.index === 0) return text;
  const head = text.slice(0, m.index);
  const citesSubsections = new RegExp(`\\(\\s*${sectionNo}\\.\\d+\\s*\\)`).test(head);
  return citesSubsections ? text.slice(m.index) : text;
}

/**
 * Best-effort title: the heading words before the body starts. The body usually starts with a
 * sentence ("Patients taking…") or the product name in capitals ("LOPRESSOR is indicated…").
 * Titles are only for display; citations use the code.
 */
export function titleOf(chunk: string): string {
  const words = chunk.replace(/^\d+\.\s?\d+\s+/, "").split(/\s+/);
  const out: string[] = [];
  const small = /^(of|and|or|with|in|to|for|the|on|an|a|by|at|as|from|vs\.?)$/;
  for (const [i, w] of words.entries()) {
    if (i > 0 && out.length > 0) {
      // Headings are Title Case. The body starts at a capitalised word followed by an ordinary
      // lowercase word ("Initiation of lisinopril…", "LOPRESSOR is indicated…").
      const next = words.slice(i + 1).find((x) => !small.test(x));
      if (/^[A-Z]/.test(w) && next !== undefined && /^[a-z]/.test(next)) break;
    }
    out.push(w);
    if (out.length >= 14) break;
  }
  return out.join(" ").replace(/[.:]$/, "");
}

const UNIT = /^(?:(?:to|and|or|-|–)\s*\d|(?:mg|mcg|µg|g|kg|ml|l|meq|mmol|micrograms?|milligrams?|units?|iu|percent|times|fold|hours?|hrs?|days?|weeks?|months?|years?|minutes?|min|x)\b)/i;

/** Splits one section field into its numbered subsections. Text before the first heading is dropped only if it was a summary. */
export function splitSubsections(text: string, sectionNo: string): Section[] {
  const body = stripHighlights(text, sectionNo);
  // A heading is the number followed by a word: "5.3 Hepatic Injury", "5. 2 Cardiac…" (space after
  // the dot), "7.7 mTOR Inhibitors" (lowercase start). Parenthesised references "( 5.3 )" never match.
  const re = new RegExp(`(?<![(,]\\s?)\\b${sectionNo}\\.\\s?(\\d{1,2})\\s+(?=[A-Za-z])`, "g");
  // Keep headings in ascending order, at most 3 numbers past the last heading kept. That skips
  // cross-references ("see 5.1") and any repeat of the subsections later in the field.
  const heads: RegExpMatchArray[] = [];
  for (const m of body.matchAll(re)) {
    const before = body.slice(Math.max(0, (m.index ?? 0) - 12), m.index).toLowerCase();
    if (/\b(see|and|or|in|section|sections|table|figure)\s*$/.test(before)) continue;
    // "2.5 mg", "12.5 mcg/day": a dose or measurement, not a heading.
    const after = body.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 14);
    if (UNIT.test(after)) continue;
    const n = Number(m[1]);
    const prev = heads.length ? Number((heads[heads.length - 1] as RegExpMatchArray)[1]) : 0;
    if (n > prev && n <= prev + 3) heads.push(m);
  }
  return heads.map((m, i) => {
    const start = m.index ?? 0;
    const end = i + 1 < heads.length ? (heads[i + 1] as RegExpMatchArray).index ?? body.length : body.length;
    const chunk = body.slice(start, end).trim();
    return { code: `${sectionNo}.${m[1]}`, title: titleOf(chunk), kind: "subsection", text: chunk, textHash: hashText(chunk) };
  });
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * openFDA sometimes repeats a section: the first array entry holds the whole section and later
 * entries repeat its subsections one by one (seen in the Ozempic label). Entries already
 * contained in the text so far are dropped.
 */
export function joinParts(parts: string[] | undefined): string | undefined {
  if (!parts || parts.length === 0) return undefined;
  const kept: string[] = [];
  for (const p of parts) {
    if (!squash(kept.join(" ")).includes(squash(p))) kept.push(p);
  }
  return kept.join(" ");
}

/** All citable units for a PLR label record. */
export function sectionsOf(record: Record<string, unknown>): Section[] {
  const out: Section[] = [];
  const bw = (record["boxed_warning"] as string[] | undefined)?.join(" ");
  if (bw) out.push({ code: "BW", title: "Boxed Warning", kind: "boxed", text: bw, textHash: hashText(bw) });
  for (const [field, no] of Object.entries(FIELD_TO_SECTION)) {
    const v = joinParts(record[field] as string[] | undefined);
    if (!v) continue;
    out.push({ code: no, title: field.replace(/_/g, " "), kind: "section", text: v, textHash: hashText(v) });
    out.push(...splitSubsections(v, no));
  }
  return out;
}
