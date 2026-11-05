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

/** Splits one section field into its numbered subsections. Text before the first heading is dropped only if it was a summary. */
export function splitSubsections(text: string, sectionNo: string): Section[] {
  const body = stripHighlights(text, sectionNo);
  const re = new RegExp(`\\b(${sectionNo}\\.\\d{1,2})\\s+([A-Z][^.]{2,80}?)(?=\\s+[A-Z][a-z]|\\s*$)`, "g");
  const heads = [...body.matchAll(re)].filter((m, i, all) => {
    // Keep headings in ascending order; ignore cross-references like "see 5.3" that repeat a number.
    const n = Number((m[1] as string).split(".")[1]);
    const prev = i > 0 ? Number(((all[i - 1] as RegExpMatchArray)[1] as string).split(".")[1]) : 0;
    return n > prev;
  });
  return heads.map((m, i) => {
    const start = m.index ?? 0;
    const end = i + 1 < heads.length ? (heads[i + 1] as RegExpMatchArray).index ?? body.length : body.length;
    const chunk = body.slice(start, end).trim();
    return { code: m[1] as string, title: (m[2] as string).trim(), kind: "subsection", text: chunk, textHash: hashText(chunk) };
  });
}

/** All citable units for a PLR label record. */
export function sectionsOf(record: Record<string, unknown>): Section[] {
  const out: Section[] = [];
  const bw = (record["boxed_warning"] as string[] | undefined)?.join(" ");
  if (bw) out.push({ code: "BW", title: "Boxed Warning", kind: "boxed", text: bw, textHash: hashText(bw) });
  for (const [field, no] of Object.entries(FIELD_TO_SECTION)) {
    const v = (record[field] as string[] | undefined)?.join(" ");
    if (!v) continue;
    out.push({ code: no, title: field.replace(/_/g, " "), kind: "section", text: v, textHash: hashText(v) });
    out.push(...splitSubsections(v, no));
  }
  return out;
}
