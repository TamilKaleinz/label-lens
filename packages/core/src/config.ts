/**
 * Versioned config bundle (architecture doc 4.4.10; PRD AI-01). Models, prompts, role styles and
 * retrieval settings live in config/. One hash covers all of it: every response returns it and
 * every eval report records it, so any change to a prompt or model is visible and re-evaluated.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Role } from "./types.js";

/** temperature null = the model's default (some models, like gpt-5.5, accept no other value). */
export interface ModelSetting { model: string | null; temperature: number | null }
export interface Config {
  hash: string;
  models: { provider: "openai"; generate: ModelSetting; gate: ModelSetting };
  retrieval: { k: number; maxChunkChars: number; maxPerSection: number; sectionPrior: number };
  prompts: { generate: string; support: string; roles: Record<Role, string> };
}

export const configDir = join(import.meta.dirname, "../../../config");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

/** sha256 over every file's path and content, in path order; first 12 hex characters. */
export function hashDir(dir: string): string {
  const h = createHash("sha256");
  for (const p of files(dir).sort()) h.update(relative(dir, p)).update("\0").update(readFileSync(p)).update("\0");
  return h.digest("hex").slice(0, 12);
}

export function loadConfig(dir = configDir): Config {
  const read = (p: string) => readFileSync(join(dir, p), "utf8");
  return {
    hash: hashDir(dir),
    models: JSON.parse(read("models.json")),
    retrieval: JSON.parse(read("retrieval.json")),
    prompts: { generate: read("prompts/generate.md"), support: read("prompts/support.md"), roles: JSON.parse(read("prompts/roles.json")) },
  };
}
