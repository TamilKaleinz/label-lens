import { describe, expect, it } from "vitest";
import { sectionsOf, splitSubsections, stripHighlights } from "../src/sections.js";

// Shape seen in the live metformin and amiodarone labels: a Highlights summary, then the full section.
const W = "5 WARNINGS AND PRECAUTIONS Lactic Acidosis: See boxed warning. ( 5.1 ) Vitamin B 12 Deficiency: Metformin may lower vitamin B 12 levels. ( 5.2 ) " +
  "5.1 Lactic Acidosis There have been postmarketing cases of metformin-associated lactic acidosis. Risk factors include renal impairment. " +
  "5.2 Vitamin B12 Deficiency In controlled clinical trials, metformin was associated with a decrease to subnormal levels. " +
  "5.3 Hypoglycemia with Concomitant Use with Insulin and Insulin Secretagogues Insulin may cause hypoglycemia, see 5.1 for related risk. " +
  "5.4 Macrovascular Outcomes There have been no clinical studies establishing conclusive evidence.";

describe("Highlights stripping", () => {
  it("removes the summary that cites subsections", () => {
    expect(stripHighlights(W, "5").startsWith("5.1 Lactic Acidosis")).toBe(true);
  });
  it("leaves text alone when there is no summary", () => {
    const plain = "5.1 Abrupt Cessation of Therapy Following abrupt cessation, severe exacerbation has occurred.";
    expect(stripHighlights(plain, "5")).toBe(plain);
  });
});

describe("subsection splitting", () => {
  const subs = splitSubsections(W, "5");
  it("finds every subsection once, in order", () => {
    expect(subs.map((s) => s.code)).toEqual(["5.1", "5.2", "5.3", "5.4"]);
  });
  it("ignores cross-references like 'see 5.1'", () => {
    expect(subs.find((s) => s.code === "5.3")?.text).toContain("see 5.1 for related risk");
  });
  it("keeps each subsection's own text", () => {
    expect(subs[0]?.text).toMatch(/^5\.1 Lactic Acidosis There have been/);
    expect(subs[0]?.text).not.toContain("Vitamin B12 Deficiency In controlled");
  });
  it("hashes ignore whitespace differences", () => {
    const a = splitSubsections(W, "5")[1]?.textHash;
    const b = splitSubsections(W.replace(/ /g, "  "), "5")[1]?.textHash;
    expect(a).toBe(b);
  });
});

describe("sectionsOf", () => {
  it("emits the Boxed Warning, sections and subsections", () => {
    const s = sectionsOf({ boxed_warning: ["WARNING: LACTIC ACIDOSIS ..."], warnings_and_cautions: [W], contraindications: ["4 CONTRAINDICATIONS Severe renal impairment (eGFR below 30 mL/min/1.73 m2)."] });
    expect(s.map((x) => x.code)).toEqual(["BW", "4", "5", "5.1", "5.2", "5.3", "5.4"]);
  });
});
