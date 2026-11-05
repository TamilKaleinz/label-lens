import { describe, expect, it } from "vitest";
import type { Chunk } from "../src/retrieve.js";
import { canonical, numbersIn, verifyClaims, type Claim } from "../src/verify.js";

const chunk: Chunk = {
  id: "2.3#0", sectionCode: "2.3", sectionTitle: "Recommendations for Use in Renal Impairment",
  text: "2.3 Recommendations for Use in Renal Impairment Metformin is contraindicated in patients with an eGFR below 30 mL/minute/1.73 m 2 . Initiation in patients with an eGFR between 30 to 45 mL/minute/1.73 m 2 is not recommended.",
};
const good: Claim = { text: "Contraindicated below eGFR 30.", sectionCode: "2.3", quote: "contraindicated in patients with an eGFR below 30 mL/minute/1.73 m2" };

describe("canonical matching", () => {
  it("ignores whitespace, case and typographic marks, and maps back to the original", () => {
    const c = canonical("A  “B” – c’d");
    expect(c.text).toBe('a"b"-c\'d');
    expect(c.map).toEqual([0, 3, 4, 5, 7, 9, 10, 11]);
  });
  it("reads numbers as written", () => {
    expect(numbersIn("500 mg twice, max 2,550 mg; 1.73 m2")).toEqual(["500", "2550", "1.73", "2"]);
  });
});

describe("verifyClaims", () => {
  it("keeps a faithful claim and returns offsets that highlight the quote in the chunk", async () => {
    const v = await verifyClaims([good], [chunk]);
    expect(v.outcome).toBe("answer");
    const loc = v.kept[0]?.location;
    expect(loc?.chunkId).toBe("2.3#0");
    expect(chunk.text.slice(loc?.start, loc?.end)).toBe("contraindicated in patients with an eGFR below 30 mL/minute/1.73 m 2");
  });
  it("becomes label-silent when no claim survives", async () => {
    const bad: Claim = { ...good, quote: "contraindicated in patients with an eGFR below 45 mL/minute" };
    const v = await verifyClaims([bad], [chunk]);
    expect(v).toMatchObject({ outcome: "label_silent", kept: [], dropped: [{ reason: "quote_not_found" }] });
  });
  it("drops a claim the support check rejects, without rewriting it (UC-04)", async () => {
    const uc04: Claim = { text: "Do not start it at eGFR 30 to 45 to prevent lactic acidosis.", sectionCode: "2.3", quote: "Initiation in patients with an eGFR between 30 to 45 mL/minute/1.73 m 2 is not recommended" };
    const support = async (c: Claim) => !/prevent/.test(c.text);
    const v = await verifyClaims([good, uc04], [chunk], support);
    expect(v.kept.map((k) => k.text)).toEqual([good.text]);
    expect(v.dropped).toMatchObject([{ text: uc04.text, reason: "unsupported" }]);
  });
  it("never calls the support check for a claim that already failed the quote check", async () => {
    let calls = 0;
    await verifyClaims([{ ...good, sectionCode: "5.1" }], [chunk], async () => { calls++; return true; });
    expect(calls).toBe(0);
  });
});
