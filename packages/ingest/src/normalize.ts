/**
 * Turns an openFDA drug label record into LabelMeta (architecture doc 4.4.1, steps 2, 5 and 6).
 * Pure functions only: the same code normalises live API records and test fixtures.
 */
import type { DosageForm, LabelFormat, LabelMeta, RecentMajorChange, Release } from "../../core/src/types.js";

export interface OpenFdaRecord {
  id: string;
  set_id: string;
  version: string;
  effective_time: string;
  openfda?: Record<string, unknown>;
  description?: string[];
  how_supplied?: string[];
  package_label_principal_display_panel?: string[];
  spl_product_data_elements?: string[];
  recent_major_changes?: string[];
  boxed_warning?: string[];
  warnings_and_cautions?: string[];
  warnings?: string[];
  [k: string]: unknown;
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const first = (v: unknown): string => arr(v)[0] ?? "";

/** D-06: PLR when a Warnings and Precautions field exists; OTC by product type; otherwise older format. */
export function classifyFormat(r: OpenFdaRecord): LabelFormat {
  const type = first(r.openfda?.["product_type"]).toUpperCase();
  if (type.includes("OTC")) return "OTC";
  if (r.warnings_and_cautions && r.warnings_and_cautions.length > 0) return "PLR";
  return "NON_PLR";
}

/**
 * Reads dosage form and release type from the label's own words.
 * Signals come from the description, How Supplied, package label and product data,
 * including coded forms used by repackagers ("TABLET, FILM COATED", "SYRINGE").
 * "capsule-shaped" describes tablets and is ignored.
 */
export function parseForm(text: string, routes: string[] = []): { dosageForm: DosageForm; release: Release; confidence: "high" | "low" } {
  const t = text
    .toLowerCase()
    .replace(/capsule[- ]shaped/g, " ")
    // SPL product data lists the tablet's shape after its imprint code: "LOPRESSOR;458;458 CAPSULE".
    .replace(/\S+;\S*\s+capsule\b/g, " ")
    // "Dr. Reddy's" is a manufacturer, not a delayed-release marker.
    .replace(/\bdr\.\s/g, " ")
    // Negated mentions: "not for inhalation, injection or ophthalmic use".
    .replace(/\bnot for [^.]*?\buse\b/g, " ");
  const parenteral = routes.some((r) => /subcutaneous|intravenous|intramuscular/i.test(r));
  const routeKnownNonParenteral = routes.length > 0 && !parenteral;
  const found = new Set<DosageForm>();
  if (parenteral || (!routeKnownNonParenteral && /\binjection\b|\bsyringe\b|\bpen\b|\bvial\b/.test(t))) found.add("injection");
  if (/\boral solution\b/.test(t)) found.add("oral_solution");
  if (/\bcapsules?\b/.test(t)) found.add("capsule");
  if (/\btablets?\b/.test(t)) found.add("tablet");

  // An injection label often also says "solution"; an oral tablet label never says injection.
  let dosageForm: DosageForm = "unknown";
  let confidence: "high" | "low" = "low";
  if (found.has("injection")) {
    dosageForm = "injection";
    confidence = found.size === 1 ? "high" : "low";
  } else if (found.size === 1) {
    dosageForm = [...found][0] as DosageForm;
    confidence = "high";
  }

  let release: Release = "n/a";
  if (dosageForm === "tablet" || dosageForm === "capsule") {
    if (/extended[- ]release|\bxr\b|\ber\b/.test(t)) release = "ER";
    else if (/delayed[- ]release|\bdr\b/.test(t)) release = "DR";
    else release = "IR";
  }
  return { dosageForm, release, confidence };
}

/**
 * Parses a Recent Major Changes line into (section, month) pairs, e.g.
 * "Boxed Warning 04/2026 Warnings and Precautions, Lactic Acidosis ( 5.1 ) 04/2026".
 */
export function parseRecentMajorChanges(text: string): RecentMajorChange[] {
  const out: RecentMajorChange[] = [];
  const re = /(\d{1,2})\s*\/\s*(\d{4})/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    const seg = text.slice(last, idx);
    last = idx + m[0].length;
    const refs = [...seg.matchAll(/\(\s*(\d{1,2}(?:\.\d{1,2})?)\s*\)/g)];
    const section = /boxed warning/i.test(seg) && refs.length === 0 ? "BW" : (refs.at(-1)?.[1] ?? "unknown");
    const month = String(Number(m[1])).padStart(2, "0");
    out.push({ section, month: `${m[2]}-${month}` });
  }
  return out;
}

const isoDate = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

export function normalize(r: OpenFdaRecord): LabelMeta {
  const of = r.openfda ?? {};
  const routes = arr(of["route"]);
  const formText = [
    ...(r.description ?? []),
    ...(r.how_supplied ?? []),
    ...(r.package_label_principal_display_panel ?? []),
    ...(r.spl_product_data_elements ?? []),
    ...arr(of["brand_name"]),
  ].join(" ");
  const form = parseForm(formText, routes);
  return {
    splId: r.id,
    setId: r.set_id,
    version: r.version,
    effectiveDate: isoDate(r.effective_time),
    manufacturer: first(of["manufacturer_name"]),
    isOriginalPackager: arr(of["is_original_packager"]).includes("true"),
    format: classifyFormat(r),
    routes,
    substances: arr(of["substance_name"]).map((s) => s.toUpperCase()).sort(),
    brandNames: arr(of["brand_name"]),
    genericNames: arr(of["generic_name"]),
    productNdcs: arr(of["product_ndc"]),
    packageNdcs: arr(of["package_ndc"]),
    dosageForm: form.dosageForm,
    release: form.release,
    formConfidence: form.confidence,
    hasBoxedWarning: Boolean(r.boxed_warning && r.boxed_warning.length > 0),
    recentMajorChanges: parseRecentMajorChanges(first(r.recent_major_changes)),
  };
}
