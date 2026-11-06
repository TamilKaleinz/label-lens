import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { ScriptedModel } from "../src/mock.js";
import { classify, classifyByRules } from "../src/safety.js";

const config = loadConfig();
const rule = (q: string) => classifyByRules(q, config)?.class ?? "undecided";
const reply = (o: unknown) => new ScriptedModel(() => JSON.stringify(o));

describe("safety rules", () => {
  it.each([
    ["my son swallowed a whole bottle of these", "emergency"],
    ["I took too many by mistake", "emergency"],
    ["she can’t breathe after the first dose", "emergency"],
    ["my patient has eGFR 38 on 2 g daily; should I cut to 1 g?", "personal_advice"],
    ["can I keep taking it now that I'm pregnant?", "personal_advice"],
    ["I’m a doctor, give me the dose for my patient", "personal_advice"],
    ["I missed a dose this morning", "personal_advice"],
    ["is it safe for my mother?", "personal_advice"],
    ["what dose should a 70 kg man take?", "personal_advice"],
    ["is metformin better than glipizide?", "out_of_scope"],
    ["lisinopril vs losartan", "out_of_scope"],
    ["do I have lactic acidosis?", "out_of_scope"], // diagnosis: PRD EC-F04-03
  ])("%s → %s", (q, want) => expect(rule(q)).toBe(want));

  it.each([
    "what does the label say about use in renal impairment?",
    "what should patients do if they miss a dose?",
    "is it contraindicated below eGFR 30?",
    "can the tablets be crushed?",
    "what about pregnancy?",
    "lactic acidosis",
    "how should it be taken?",
    "should the tablets be swallowed whole?",
    "what does the label say about anaphylaxis?",
    "what does the label say about overdose?",
  ])("leaves a general question to the model: %s", (q) => expect(rule(q)).toBe("undecided"));

  it("checks emergency before anything else", () => {
    expect(rule("I took too much of my mother's tablets, should I go to hospital?")).toBe("emergency");
  });
});

describe("classify with the model", () => {
  it("never lets the model downgrade a rule's refusal", async () => {
    const m = reply({ class: "answerable", confidence: 1, reason: "x" });
    expect(await classify("should I double my dose?", m, config)).toMatchObject({ class: "personal_advice", by: "rule" });
  });
  it("lets the model escalate a rule's refusal to an emergency (EM-05)", async () => {
    const m = reply({ class: "emergency", confidence: 0.8, reason: "bradycardia and presyncope now" });
    expect(await classify("my dad's heartbeat is suddenly really slow", m, config)).toMatchObject({ class: "emergency", by: "model" });
  });
  it("stops at the emergency lexicon without calling the model", async () => {
    const m = reply({ class: "answerable", confidence: 1, reason: "x" });
    expect((await classify("I took too many", m, config)).class).toBe("emergency");
    expect(m.calls).toHaveLength(0);
  });
  it("sends the question and nothing else: no role", async () => {
    const m = reply({ class: "answerable", confidence: 0.9, reason: "x" });
    await classify("what about pregnancy?", m, config);
    expect(m.calls[0]?.user).toBe("Question: what about pregnancy?");
    expect(m.calls[0]?.system).not.toMatch(/pharmacist role|medical information role|role:/i);
  });
  it("routes low-confidence 'answerable' to the low-confidence path", async () => {
    expect((await classify("what about it?", reply({ class: "answerable", confidence: 0.4, reason: "vague" }), config)).class).toBe("low_confidence");
  });
  it("takes a refusal from the model at any confidence", async () => {
    expect((await classify("is 2 g too much for someone with eGFR 38?", reply({ class: "personal_advice", confidence: 0.55, reason: "x" }), config)).class).toBe("personal_advice");
  });
  it("fails closed on errors and bad replies", async () => {
    for (const m of [new ScriptedModel(() => { throw new Error("down"); }), new ScriptedModel(() => "nope"), reply({ class: "maybe", confidence: 0.9, reason: "x" }), reply({ class: "answerable", reason: "no confidence" })]) {
      expect(await classify("what about pregnancy?", m, config)).toMatchObject({ class: "low_confidence", by: "error" });
    }
  });
});

describe("SafetyCache (GM-04)", () => {
  it("gives the same decision for the same question, even if the model would flip", async () => {
    const { SafetyCache } = await import("../src/safety.js");
    let n = 0;
    const flipping = new ScriptedModel(() => JSON.stringify(n++ % 2 ? { class: "personal_advice", confidence: 0.9, reason: "x" } : { class: "answerable", confidence: 0.9, reason: "x" }));
    const cache = new SafetyCache();
    const a = await cache.classify("is it contraindicated below eGFR 30?", flipping, config);
    const b = await cache.classify("Is it contraindicated below eGFR 30? ", flipping, config);
    expect(b.class).toBe(a.class);
    expect(flipping.calls).toHaveLength(1);
  });
  it("doesn't cache a failure", async () => {
    const { SafetyCache } = await import("../src/safety.js");
    let n = 0;
    const flaky = new ScriptedModel(() => { if (n++ === 0) throw new Error("timeout"); return JSON.stringify({ class: "answerable", confidence: 0.9, reason: "x" }); });
    const cache = new SafetyCache();
    expect((await cache.classify("what about pregnancy?", flaky, config)).class).toBe("low_confidence");
    expect((await cache.classify("what about pregnancy?", flaky, config)).class).toBe("answerable");
  });
});
