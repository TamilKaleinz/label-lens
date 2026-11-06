import { describe, expect, it } from "vitest";
import { Engine } from "../src/answer.js";
import { loadConfig } from "../src/config.js";
import { ExtractiveModel, ScriptedModel, excerptsFromPrompt } from "../src/mock.js";
import type { ModelClient, ModelRequest } from "../src/model.js";
import { fullLabel, fullStore, sectionsFor } from "./fullStore.js";

const config = loadConfig();
const engine = (model: ModelClient = new ExtractiveModel(), supportCheck = true) => new Engine({ store: fullStore, sectionsFor, model, config, supportCheck });
const metformin = { setId: fullLabel("DS-01").setId };
const amiodarone = { setId: fullLabel("DS-13").setId };

const SAFE = JSON.stringify({ class: "answerable", confidence: 0.95, reason: "test" });
/** A scripted model that is answerable at the safety step and replies `gen` to generation. */
const genReply = (gen: () => string) => new ScriptedModel((req) => (req.purpose === "safety" ? SAFE : gen()));
const genCalls = (m: { calls: ModelRequest[] }) => m.calls.filter((c) => c.purpose === "generate");

/** Wraps the extractive mock, adding one extra claim to every generation. */
const withExtra = (extra: { text: string; section_code: string; quote: string }) => {
  const base = new ExtractiveModel();
  return new ScriptedModel(async (req: ModelRequest) => {
    const raw = await base.complete(req);
    if (req.purpose !== "generate") return raw;
    const o = JSON.parse(raw);
    return JSON.stringify({ ...o, label_silent: false, claims: [...o.claims, extra] });
  });
};

describe("answer pipeline (mock model)", () => {
  it("answers with located, cited claims, the label header and the config hash", async () => {
    const r = await engine().answer({ role: "pharmacist", ref: metformin, question: "is it contraindicated below eGFR 30?" });
    expect(r.kind).toBe("answer");
    if (r.kind !== "answer") return;
    expect(r.configHash).toBe(config.hash);
    expect(r.label).toMatchObject({ setId: metformin.setId, manufacturer: expect.any(String), representative: false });
    expect(r.claims.length).toBeGreaterThan(0);
    for (const c of r.claims) expect(c.quote.length).toBeGreaterThan(20);
    expect(r.boxedWarning.present).toBe(true);
  });

  it("drops a fabricated claim and keeps the rest", async () => {
    const r = await engine(withExtra({ text: "Lactic acidosis is rare and usually mild.", section_code: "5.1", quote: "Lactic acidosis is a rare but serious complication that is usually mild." }))
      .answer({ role: "pharmacist", ref: metformin, question: "what about lactic acidosis?" });
    expect(r.kind).toBe("answer");
    if (r.kind !== "answer") return;
    expect(r.claims.map((c) => c.text)).not.toContain("Lactic acidosis is rare and usually mild.");
    expect(r.dropped.reasons).toContain("quote_not_found");
  });

  it("drops a real quote stretched into a claim it doesn't support (UC-04), via the support check", async () => {
    const uc04 = { text: "Take it with meals to prevent lactic acidosis.", section_code: "2.1", quote: "The recommended starting dose of metformin hydrochloride tablets is 500 mg orally twice a day or 850 mg once a day, given with meals." };
    const on = await engine(withExtra(uc04)).answer({ role: "pharmacist", ref: metformin, question: "how should it be taken?" });
    const off = await engine(withExtra(uc04), false).answer({ role: "pharmacist", ref: metformin, question: "how should it be taken?" });
    if (on.kind !== "answer" || off.kind !== "answer") throw new Error("expected answers");
    expect(on.claims.map((c) => c.text)).not.toContain(uc04.text);
    expect(on.dropped.reasons).toContain("unsupported");
    expect(off.claims.map((c) => c.text)).toContain(uc04.text); // the quote check alone can't catch it
  });

  it("fails closed on a reply that isn't JSON, or doesn't match the schema", async () => {
    for (const reply of ["not json", JSON.stringify({ claims: [] }), JSON.stringify({ label_silent: false, claims: [{ text: 1 }] }), JSON.stringify({ label_silent: true, claims: [{ text: "x", section_code: "5.1", quote: "y" }] })]) {
      const r = await engine(genReply(() => reply)).answer({ role: "pharmacist", ref: metformin, question: "what about lactic acidosis?" });
      expect(r).toMatchObject({ kind: "label_silent", claims: [], error: expect.any(String) });
    }
  });

  it("fails closed when the model throws", async () => {
    const r = await engine(genReply(() => { throw new Error("timeout"); })).answer({ role: "pharmacist", ref: metformin, question: "what about lactic acidosis?" });
    expect(r).toMatchObject({ kind: "label_silent", error: "model error: timeout" });
  });

  it("is label-silent without calling the model when nothing in the label matches", async () => {
    const m = new ExtractiveModel();
    const r = await engine(m).answer({ role: "pharmacist", ref: amiodarone, question: "cranberry" });
    expect(r).toMatchObject({ kind: "label_silent", boxedWarning: { present: true, cited: false } });
    expect(genCalls(m)).toHaveLength(0);
  });

  it("shows the model excerpts from the resolved label only, Boxed Warning included", async () => {
    const m = new ExtractiveModel();
    await engine(m).answer({ role: "pharmacist", ref: amiodarone, question: "how should the tablets be stored?" });
    const gen = m.calls.find((c) => c.purpose === "generate") as ModelRequest;
    const ex = excerptsFromPrompt(gen.user);
    expect(ex.map((e) => e.code)).toContain("BW");
    expect(gen.user).toContain(fullLabel("DS-13").version);
    expect(gen.user.toLowerCase()).not.toContain("metformin");
    // The reply can only cite sections the model was shown.
    const codes = (gen.schema as any).properties.claims.items.properties.section_code.enum;
    expect([...codes].sort()).toEqual([...new Set(ex.map((e) => e.code))].sort());
  });

  it("puts the role's style in the prompt; the role changes nothing else", async () => {
    const prompts: Record<string, ModelRequest> = {};
    for (const role of ["pharmacist", "medical_information", "pv"] as const) {
      const m = new ExtractiveModel();
      await engine(m).answer({ role, ref: metformin, question: "what about lactic acidosis?" });
      prompts[role] = genCalls(m)[0] as ModelRequest;
    }
    expect(prompts["pharmacist"]?.system).toContain(config.prompts.roles.pharmacist);
    expect(prompts["pv"]?.system).toContain(config.prompts.roles.pv);
    expect(prompts["pharmacist"]?.user).toBe(prompts["pv"]?.user);
  });

  it("asks which product before anything else when the name is ambiguous", async () => {
    const m = new ExtractiveModel();
    const r = await engine(m).answer({ role: "pharmacist", ref: { q: "metformin" }, question: "max dose?" });
    expect(r.kind).toBe("clarify");
    expect(genCalls(m)).toHaveLength(0);
  });

  it("identifies an unsupported format and declines without calling the model", async () => {
    const m = new ExtractiveModel();
    const r = await engine(m).answer({ role: "pharmacist", ref: { setId: fullLabel("DS-10").setId }, question: "dose?" });
    expect(r.kind).toBe("unsupported_format");
    expect(genCalls(m)).toHaveLength(0);
  });

  it("refuses live calls until a model is configured", async () => {
    const { OpenAIClient } = await import("../src/model.js");
    const unset = { ...config, models: { ...config.models, generate: { model: null, temperature: null }, gate: { model: null, temperature: null } } };
    const e = new Engine({ store: fullStore, sectionsFor, model: new OpenAIClient("test-key"), config: unset });
    const r = await e.answer({ role: "pharmacist", ref: metformin, question: "what about lactic acidosis?" });
    // The classifier can't run either, so the question fails closed to the low-confidence path.
    expect(r).toMatchObject({ kind: "clarify_question", safety: { class: "low_confidence", by: "error" } });
  });
});
