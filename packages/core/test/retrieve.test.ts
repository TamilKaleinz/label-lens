import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chunkLabel, intentsOf, LabelIndex, stem } from "../src/retrieve.js";
import { sectionsOf, type Section } from "../../ingest/src/sections.js";

const full = (setId: string) => JSON.parse(readFileSync(join(import.meta.dirname, "../../../fixtures/full", `${setId}.json`), "utf8"));
const sec = (code: string, text: string, kind: Section["kind"] = "subsection"): Section => ({ code, title: "", kind, text, textHash: "" });

describe("chunking", () => {
  it("indexes subsections, not the parent section that contains them", () => {
    const c = chunkLabel([sec("5", "5 WARNINGS 5.1 A text. 5.2 B text.", "section"), sec("5.1", "5.1 A text."), sec("5.2", "5.2 B text."), sec("4", "4 CONTRAINDICATIONS None.", "section")]);
    expect(c.map((x) => x.sectionCode)).toEqual(["5.1", "5.2", "4"]);
  });
  it("splits long units on sentences and never crosses a subsection", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence ${i} gives 2.5 mg twice daily.`).join(" ");
    const c = chunkLabel([sec("2.1", long), sec("2.2", "2.2 Short.")], 300);
    expect(c.filter((x) => x.sectionCode === "2.1").length).toBeGreaterThan(1);
    expect(c.every((x) => x.text.length <= 300)).toBe(true);
    expect(c.filter((x) => x.sectionCode === "2.1").map((x) => x.text).join(" ")).not.toContain("2.2 Short");
    expect(c.some((x) => /2\.$/.test(x.text))).toBe(false); // "2.5 mg" is never cut at the dot
  });
});

describe("query processing", () => {
  it("stems simply", () => {
    expect([stem("reactions"), stem("injuries"), stem("crushed"), stem("taking"), stem("loss")]).toEqual(["reaction", "injury", "crush", "tak", "loss"]);
  });
  it("detects section priors from the question", () => {
    expect(intentsOf("can the tablets be crushed?")).toContain("dosing");
    expect(intentsOf("interaction with omeprazole?")).toContain("interaction");
    expect(intentsOf("what about pregnancy?")).toEqual(["population"]);
  });
});

describe("LabelIndex on full labels", () => {
  const amiodarone = new LabelIndex(sectionsOf(full("95cef33b-c0e6-b17c-7cbb-f5c066872705")));
  it("always returns the Boxed Warning beside the results, even for an unrelated question", () => {
    const r = amiodarone.search("how should the tablets be stored?");
    expect(r.boxedWarning?.sectionCode).toBe("BW");
    expect(r.chunks[0]?.sectionCode).toMatch(/^16/);
  });
  it("keeps at most two chunks per section", () => {
    const r = amiodarone.search("pulmonary toxicity hepatic injury arrhythmia", 10);
    const counts = new Map<string, number>();
    for (const c of r.chunks) counts.set(c.sectionCode, (counts.get(c.sectionCode) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });
  it("returns nothing when no word of the question is in the label (the label-silent path)", () => {
    expect(amiodarone.search("cranberry").chunks).toEqual([]);
  });
});
