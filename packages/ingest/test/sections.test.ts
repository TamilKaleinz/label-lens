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

// Patterns found in the full openFDA labels on 2026-11-05 that the excerpts hid.
describe("subsection splitting: real-label traps", () => {
  const codes = (t: string, n: string) => splitSubsections(t, n).map((s) => s.code);
  it("accepts a space after the dot: '5. 2 Cardiac Adverse Reactions' (Synthroid, metformin)", () => {
    expect(codes("5.1 Lactic Acidosis Text here. 5. 2 Cardiac Adverse Reactions Text here.", "5")).toEqual(["5.1", "5.2"]);
  });
  it("accepts a lowercase heading: '7.7 mTOR Inhibitors' (lisinopril)", () => {
    expect(codes("7.3 NSAIDs Text. 7.6 Gold Nitritoid reactions occurred. 7.7 mTOR Inhibitors Patients taking them. 7.8 Neprilysin Inhibitor Patients taking them.", "7")).toEqual(["7.3", "7.6", "7.7", "7.8"]);
  });
  it("never treats a dose as a heading: 'initial dose is 2.5 mg' (lisinopril section 2)", () => {
    const t = "2.1 Hypertension The initial dose is 10 mg. 2.2 Heart Failure Start at 2.5 mg once daily. 2.3 Acute MI Give 5 mg. 2.4 Renal Impairment Use 2.5 mg.";
    expect(codes(t, "2")).toEqual(["2.1", "2.2", "2.3", "2.4"]);
  });
  it("never treats a range as a heading: 'doses ranging from 12.5 to 200 mg'", () => {
    expect(codes("12.1 Mechanism of Action Text. 12.3 Pharmacokinetics Doses ranging from 12.5 to 200 mg once daily. 12.5 Pharmacogenomics CYP2D6 is absent.", "12")).toEqual(["12.1", "12.3", "12.5"]);
  });
  it("drops openFDA's repeated subsection entries (Ozempic)", () => {
    const parts = ["5 WARNINGS 5.1 Risk of Tumors Text one. 5.2 Pancreatitis Text two.", "5.1 Risk of Tumors Text one.", "5.2 Pancreatitis Text two."];
    expect(sectionsOf({ warnings_and_cautions: parts }).map((s) => s.code)).toEqual(["5", "5.1", "5.2"]);
  });
  it("reads a title up to where the body starts", () => {
    const s = splitSubsections("5.1 Risk of Thyroid C-Cell Tumors In mice and rats, semaglutide caused tumors. 5.2 Pancreatitis In trials it occurred.", "5");
    expect(s.map((x) => x.title)).toEqual(["Risk of Thyroid C-Cell Tumors", "Pancreatitis"]);
  });
});
