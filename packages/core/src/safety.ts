/**
 * Safety classifier (architecture doc 4.4.3; PRD F-04, FR-F04-01, FR-F04-05, AI-02, D-04).
 *
 * Input is the question ONLY. The role is never passed in, so a claimed or selected role can't
 * change what is refused (GM-04), and the boundary is tested once for every role.
 *
 * 1. Rules first. The emergency lexicon stops everything, without a model call.
 * 2. Then a small model classifies the question, with a confidence. Below the threshold an
 *    "answerable" becomes low confidence. Any model error also goes there (fail closed).
 * 3. When a personal-advice or out-of-scope rule fired, the model is still asked, but it can only
 *    escalate, never downgrade: emergency > personal advice > out of scope > low confidence >
 *    answerable. (Found in the first live run: "my dad… heartbeat suddenly really slow, feels faint"
 *    hit the "my dad" rule, and the emergency was never seen.)
 * 4. The class is fixed here, before retrieval. Nothing later can upgrade a refusal to an answer.
 */
import type { Config } from "./config.js";
import type { ModelClient } from "./model.js";

export type SafetyClass = "answerable" | "personal_advice" | "out_of_scope" | "emergency" | "low_confidence";

export interface SafetyVerdict {
  class: SafetyClass;
  /** "rule" when a pattern decided, "model" when the classifier did, "error" when it failed closed. */
  by: "rule" | "model" | "error";
  /** The pattern or the model's reason, for logs and eval reports. Never shown to users as advice. */
  detail: string;
  confidence?: number;
}

const MODEL_CLASSES = ["answerable", "personal_advice", "out_of_scope", "emergency"] as const;

export const SAFETY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["class", "confidence", "reason"],
  properties: {
    class: { type: "string", enum: [...MODEL_CLASSES] },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
} as const;

/** Lowercase, curly apostrophes made plain, so "I’m" matches "i'm". */
export const norm = (q: string) => q.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

export function classifyByRules(question: string, config: Config): SafetyVerdict | undefined {
  const q = norm(question);
  const hit = config.safety.emergency.find((w) => q.includes(w));
  if (hit) return { class: "emergency", by: "rule", detail: `emergency: "${hit}"` };
  for (const p of config.safety.personal) if (new RegExp(p, "i").test(q)) return { class: "personal_advice", by: "rule", detail: `personal: /${p}/` };
  for (const p of config.safety.outOfScope) if (new RegExp(p, "i").test(q)) return { class: "out_of_scope", by: "rule", detail: `out of scope: /${p}/` };
  return undefined;
}

/** Higher is more restrictive. */
export const SEVERITY: Record<SafetyClass, number> = { answerable: 0, low_confidence: 1, out_of_scope: 2, personal_advice: 3, emergency: 4 };

async function classifyByModel(question: string, model: ModelClient, config: Config): Promise<SafetyVerdict> {
  try {
    const raw = await model.complete({
      purpose: "safety",
      model: config.models.gate.model,
      temperature: config.models.gate.temperature,
      system: config.prompts.safety,
      user: `Question: ${question}`,
      schemaName: "safety_class",
      schema: SAFETY_SCHEMA as unknown as Record<string, unknown>,
    });
    const v = JSON.parse(raw) as { class?: unknown; confidence?: unknown; reason?: unknown };
    const cls = MODEL_CLASSES.find((c) => c === v.class);
    const conf = typeof v.confidence === "number" ? v.confidence : NaN;
    if (!cls || !Number.isFinite(conf)) return { class: "low_confidence", by: "error", detail: "classifier reply out of schema" };
    const detail = typeof v.reason === "string" ? v.reason : "";
    // Emergency and refusals are taken at any confidence; only "answerable" must clear the bar.
    if (cls === "answerable" && conf < config.safety.lowConfidenceBelow)
      return { class: "low_confidence", by: "model", detail: `answerable at ${conf} < ${config.safety.lowConfidenceBelow}: ${detail}`, confidence: conf };
    return { class: cls, by: "model", detail, confidence: conf };
  } catch (e) {
    return { class: "low_confidence", by: "error", detail: `classifier error: ${(e as Error).message}` };
  }
}

export async function classify(question: string, model: ModelClient, config: Config): Promise<SafetyVerdict> {
  const rule = classifyByRules(question, config);
  if (rule?.class === "emergency") return rule;
  const byModel = await classifyByModel(question, model, config);
  if (!rule) return byModel;
  // A rule decided a refusal; the model may only make it stricter.
  return SEVERITY[byModel.class] > SEVERITY[rule.class] ? { ...byModel, detail: `escalated from ${rule.detail}: ${byModel.detail}` } : rule;
}

/**
 * One safety decision per question per config (GM-04). The classifier model can give different
 * answers to identical input, even at temperature 0, so without this the same question could be
 * refused for one user and answered for the next. Keyed by config hash, so a prompt change starts
 * fresh. In production this lives in Redis beside the answer cache; here, in memory.
 * Errors are not cached, so a transient failure doesn't pin a question to "low confidence".
 */
export class SafetyCache {
  private readonly m = new Map<string, SafetyVerdict>();
  async classify(question: string, model: ModelClient, config: Config): Promise<SafetyVerdict> {
    const key = `${config.hash}|${norm(question)}`;
    const hit = this.m.get(key);
    if (hit) return hit;
    const v = await classify(question, model, config);
    if (v.by !== "error") this.m.set(key, v);
    return v;
  }
}
