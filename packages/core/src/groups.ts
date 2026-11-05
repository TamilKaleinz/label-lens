/**
 * Equivalence groups (D-16, FR-F01-04): labels with the same active ingredient(s),
 * dosage form, release type and route. Computed at ingestion, never at question time.
 */
import type { EquivalenceGroup, LabelMeta } from "./types.js";

const FORM_WORDS: Record<string, string> = {
  tablet: "tablets",
  capsule: "capsules",
  oral_solution: "oral solution",
  injection: "injection",
  unknown: "form not stated",
};
const RELEASE_WORDS: Record<string, string> = { IR: "immediate-release", ER: "extended-release", DR: "delayed-release", "n/a": "" };

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Newest original-packager label; if the group has none, the newest label of any packager. */
export function pickRepresentative(members: LabelMeta[]): LabelMeta {
  const newest = (a: LabelMeta, b: LabelMeta) =>
    b.effectiveDate.localeCompare(a.effectiveDate) || Number(b.version) - Number(a.version);
  const originals = members.filter((m) => m.isOriginalPackager).sort(newest);
  return (originals[0] ?? [...members].sort(newest)[0]) as LabelMeta;
}

export function groupKey(l: LabelMeta): string {
  // A label whose form couldn't be read is never merged with others (FR-F01-08).
  const formPart = l.formConfidence === "low" ? `uncertain:${l.setId}` : `${l.dosageForm}:${l.release}`;
  return [l.substances.join("+"), formPart, (l.routes[0] ?? "UNKNOWN").toUpperCase()].join("|");
}

export function buildGroups(labels: LabelMeta[]): EquivalenceGroup[] {
  const byKey = new Map<string, LabelMeta[]>();
  for (const l of labels) {
    const k = groupKey(l);
    byKey.set(k, [...(byKey.get(k) ?? []), l]);
  }
  return [...byKey.entries()].map(([id, members]) => {
    const m0 = members[0] as LabelMeta;
    return {
      id,
      substances: m0.substances,
      dosageForm: m0.dosageForm,
      release: m0.release,
      route: (m0.routes[0] ?? "UNKNOWN").toUpperCase(),
      uncertain: m0.formConfidence === "low",
      members,
      representative: pickRepresentative(members),
    };
  });
}

export function describeGroup(g: EquivalenceGroup): string {
  const names = g.substances.map(titleCase).join(" and ");
  const release = RELEASE_WORDS[g.release] ?? "";
  const form = FORM_WORDS[g.dosageForm] ?? g.dosageForm;
  const route = g.route === "ORAL" || g.dosageForm === "oral_solution" ? "" : ` (${g.route.toLowerCase()})`;
  return `${names}, ${release ? release + " " : ""}${form}${route}`.replace(/\s+/g, " ").trim();
}
