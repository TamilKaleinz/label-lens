/**
 * Generator (architecture doc 4.4.5): the one model step that writes text.
 *
 * It sees only the excerpts the retriever chose from one label version, writes claims with quotes
 * in the role's style, and must match a strict JSON schema. Anything that doesn't parse is treated
 * as no answer (fail closed); the claim checker then decides what survives.
 */
import type { Config } from "./config.js";
import type { ModelClient } from "./model.js";
import type { Chunk, Retrieval } from "./retrieve.js";
import type { LabelMeta, Role } from "./types.js";
import type { Claim } from "./verify.js";

export const GENERATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label_silent", "claims"],
  properties: {
    label_silent: { type: "boolean" },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "section_code", "quote"],
        properties: { text: { type: "string" }, section_code: { type: "string" }, quote: { type: "string" } },
      },
    },
  },
} as const;

/** The excerpts the generator is shown: the retrieved chunks, plus the Boxed Warning if it isn't among them. */
export function excerptsFor(r: Retrieval): Chunk[] {
  const out: Chunk[] = [...r.chunks];
  if (r.boxedWarning && !out.some((c) => c.sectionCode === "BW")) out.push(r.boxedWarning);
  return out;
}

export function buildGeneratePrompt(config: Config, role: Role, question: string, label: LabelMeta, excerpts: Chunk[]) {
  const system = config.prompts.generate.replace("{{role_style}}", config.prompts.roles[role]);
  const header = `Label: ${label.brandNames[0] ?? label.genericNames[0] ?? "unknown"} (${label.manufacturer}), version ${label.version}, effective ${label.effectiveDate}`;
  const body = excerpts.map((c, i) => `[E${i + 1}] section ${c.sectionCode} ${c.sectionTitle}\n${c.text}`).join("\n\n");
  const user = `${header}\n\nQuestion: ${question}\n\nExcerpts:\n\n${body}`;
  return { system, user };
}

export type Generation =
  | { ok: true; labelSilent: boolean; claims: Claim[] }
  | { ok: false; error: string };

/** Strict parse: wrong shape, wrong types or extra keys mean no answer. */
export function parseGeneration(raw: string): Generation {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { ok: false, error: "reply was not JSON" };
  }
  const o = v as { label_silent?: unknown; claims?: unknown };
  if (typeof o !== "object" || o === null || typeof o.label_silent !== "boolean" || !Array.isArray(o.claims))
    return { ok: false, error: "reply did not match the schema" };
  const claims: Claim[] = [];
  for (const c of o.claims as Record<string, unknown>[]) {
    if (typeof c?.["text"] !== "string" || typeof c["section_code"] !== "string" || typeof c["quote"] !== "string")
      return { ok: false, error: "a claim did not match the schema" };
    claims.push({ text: c["text"], sectionCode: c["section_code"].trim(), quote: c["quote"] });
  }
  // A reply that says the label is silent but still makes claims is contradictory: trust neither.
  if (o.label_silent && claims.length > 0) return { ok: false, error: "label_silent with claims" };
  return { ok: true, labelSilent: o.label_silent, claims };
}

export async function generate(model: ModelClient, config: Config, role: Role, question: string, label: LabelMeta, excerpts: Chunk[]): Promise<Generation> {
  const { system, user } = buildGeneratePrompt(config, role, question, label, excerpts);
  try {
    const raw = await model.complete({
      purpose: "generate",
      model: config.models.generate.model,
      temperature: config.models.generate.temperature,
      system,
      user,
      schemaName: "label_answer",
      schema: GENERATE_SCHEMA as unknown as Record<string, unknown>,
    });
    return parseGeneration(raw);
  } catch (e) {
    return { ok: false, error: `model error: ${(e as Error).message}` };
  }
}
