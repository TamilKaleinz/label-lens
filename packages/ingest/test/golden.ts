/** Builds the golden snapshot for each full demo label: what ingestion must keep producing. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { normalize, type OpenFdaRecord } from "../src/normalize.js";
import { sectionsOf } from "../src/sections.js";

export const fullDir = join(import.meta.dirname, "../../../fixtures/full");

export function snapshot(r: OpenFdaRecord) {
  const m = normalize(r);
  return {
    setId: m.setId, version: m.version, format: m.format,
    dosageForm: m.dosageForm, release: m.release, formConfidence: m.formConfidence,
    hasBoxedWarning: m.hasBoxedWarning, recentMajorChanges: m.recentMajorChanges,
    sections: m.format === "PLR" ? sectionsOf(r).map((s) => s.code) : [],
  };
}

export const fullRecords = (): OpenFdaRecord[] =>
  readdirSync(fullDir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => JSON.parse(readFileSync(join(fullDir, f), "utf8")) as OpenFdaRecord);
