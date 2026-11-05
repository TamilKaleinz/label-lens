/** Shared types for the Label Lens engine. See PRD v0.3 (F-01, F-05) and the architecture doc (4.2). */

export type Role = "pharmacist" | "medical_information" | "pv";

export type LabelFormat = "PLR" | "NON_PLR" | "OTC";
export type DosageForm = "tablet" | "capsule" | "oral_solution" | "injection" | "unknown";
export type Release = "IR" | "ER" | "DR" | "n/a";

export interface RecentMajorChange {
  /** "BW" for the Boxed Warning, otherwise the cited section, e.g. "5.1" or "2". */
  section: string;
  /** Year and month of the change, "YYYY-MM". */
  month: string;
}

/** One ingested label version: the metadata the resolver and the provisional rule need. */
export interface LabelMeta {
  splId: string;
  setId: string;
  version: string;
  /** ISO date, YYYY-MM-DD. */
  effectiveDate: string;
  manufacturer: string;
  isOriginalPackager: boolean;
  format: LabelFormat;
  routes: string[];
  /** Upper-case substance names, sorted. */
  substances: string[];
  brandNames: string[];
  genericNames: string[];
  productNdcs: string[];
  packageNdcs: string[];
  dosageForm: DosageForm;
  release: Release;
  /** "low" when the dosage form could not be read reliably from the label text (FR-F01-08). */
  formConfidence: "high" | "low";
  hasBoxedWarning: boolean;
  recentMajorChanges: RecentMajorChange[];
}

export interface EquivalenceGroup {
  id: string;
  substances: string[];
  dosageForm: DosageForm;
  release: Release;
  route: string;
  uncertain: boolean;
  members: LabelMeta[];
  representative: LabelMeta;
}

export type LabelRef =
  | { ndc: string }
  | { setId: string; version?: string }
  | { groupId: string }
  | { q: string };

export interface GroupChoice {
  groupId: string;
  description: string;
  labelCount: number;
}

export type ResolveResult =
  | { status: "resolved"; label: LabelMeta; representative: boolean; via: "exact" | "group" }
  | { status: "needs_choice"; kind: "group"; groups: GroupChoice[] }
  | { status: "needs_choice"; kind: "label"; groupId: string; labels: LabelMeta[] }
  | { status: "not_found"; message: string }
  | { status: "unsupported_format"; label: LabelMeta; message: string };
