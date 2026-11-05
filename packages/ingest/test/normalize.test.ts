import { describe, expect, it } from "vitest";
import fixtures from "../../../fixtures/labels.json";
import { classifyFormat, normalize, parseForm, parseRecentMajorChanges, type OpenFdaRecord } from "../src/normalize.js";

const recs = fixtures.results as unknown as (OpenFdaRecord & { _demo_id: string })[];
const byId = (id: string) => normalize(recs.find((r) => r._demo_id === id) as OpenFdaRecord);

describe("format classification (D-06)", () => {
  it("PLR, older Rx and OTC are told apart", () => {
    expect(byId("DS-01").format).toBe("PLR");
    expect(byId("DS-10").format).toBe("NON_PLR");
    expect(byId("DS-19").format).toBe("OTC");
    expect(classifyFormat({ id: "x", set_id: "x", version: "1", effective_time: "20260101" })).toBe("NON_PLR");
  });
});

describe("dosage form and release", () => {
  const cases: [string, string, string, string][] = [
    ["DS-01", "tablet", "IR", "high"],
    ["DS-02", "tablet", "IR", "high"], // repackager coded form: "TABLET, FILM COATED"
    ["DS-03", "tablet", "ER", "high"],
    ["DS-04", "tablet", "ER", "high"],
    ["DS-05", "oral_solution", "n/a", "high"],
    ["DS-06", "tablet", "IR", "high"],
    ["CTX-01", "tablet", "ER", "high"], // Janumet XR
    ["DS-08", "tablet", "IR", "high"], // "capsule-shaped" tablets are tablets
    ["DS-12", "oral_solution", "n/a", "high"],
    ["DS-15", "tablet", "ER", "high"],
    ["DS-16", "tablet", "IR", "high"],
    ["DS-17", "tablet", "IR", "high"], // Ozempic tablets
    ["DS-18", "injection", "n/a", "high"], // Ozempic injection, repackager
    ["DS-19", "unknown", "n/a", "low"], // Tylenol label excerpt names no form
  ];
  it.each(cases)("%s reads as %s %s (%s confidence)", (id, form, release, conf) => {
    const l = byId(id);
    expect([l.dosageForm, l.release, l.formConfidence]).toEqual([form, release, conf]);
  });
  it("conflicting signals give low confidence", () => {
    expect(parseForm("oral solution and tablets").confidence).toBe("low");
  });
});

describe("Recent Major Changes parser", () => {
  it("reads Boxed Warning and section changes", () => {
    expect(parseRecentMajorChanges("Boxed Warning 08/2026 Warnings and Precautions, Lactic Acidosis ( 5.1 ) 08/2026")).toEqual([
      { section: "BW", month: "2026-08" },
      { section: "5.1", month: "2026-08" },
    ]);
    expect(parseRecentMajorChanges("Boxed Warning 6/2026 Warnings and Precautions, Lactic Acidosis (5.1) 6/2026")).toEqual([
      { section: "BW", month: "2026-06" },
      { section: "5.1", month: "2026-06" },
    ]);
  });
  it("reads multi-section lines", () => {
    expect(byId("DS-12").recentMajorChanges).toHaveLength(6);
    expect(byId("DS-12").recentMajorChanges[0]).toEqual({ section: "1", month: "2023-11" });
    expect(byId("DS-11").recentMajorChanges.map((c) => c.section)).toEqual(["2.2", "2.4"]);
  });
  it("labels without changes give an empty list", () => {
    expect(byId("DS-02").recentMajorChanges).toEqual([]);
  });
});

describe("identifiers survive normalisation", () => {
  it("keeps SPL ID, set ID, version, date and NDCs", () => {
    const l = byId("DS-02");
    expect(l.splId).toBe("017fc887-de17-4f26-a715-b28bc6271e09");
    expect(l.setId).toBe("b6d7edc9-93d6-4480-906d-55c18d053600");
    expect(l.version).toBe("1");
    expect(l.effectiveDate).toBe("2026-09-02");
    expect(l.productNdcs).toContain("50090-8043");
    expect(l.isOriginalPackager).toBe(false);
  });
});
