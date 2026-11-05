/**
 * Eval runner, stage 3: claim checker (GM-01). Each seeded claim is checked against the chunks the
 * retriever returns for its question on the full label (plus the Boxed Warning), exactly as the
 * generator's claims will be. Writes evals/reports/claims-<date>.{json,md}; exits 1 on any failure.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import spec from "./claims-v0.1.json";
import { LabelIndex } from "../packages/core/src/retrieve.js";
import { checkQuote, type Claim } from "../packages/core/src/verify.js";
import { sectionsOf } from "../packages/ingest/src/sections.js";

const here = dirname(fileURLToPath(import.meta.url));
const [head, ...rows] = readFileSync(join(here, "demo-drugs.csv"), "utf8").trim().split("\n");
const cols = (head as string).split(",");
const setIdOf = new Map(rows.map((r) => {
  const cells = r.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "")) ?? [];
  return [cells[cols.indexOf("id")] as string, cells[cols.indexOf("set_id")] as string];
}));
const index = (demo: string) => new LabelIndex(sectionsOf(JSON.parse(readFileSync(join(here, "../fixtures/full", `${setIdOf.get(demo)}.json`), "utf8"))));

type Case = { id: string; label: string; q: string; claim: Claim; expect: string; support?: string; why: string };
const results = (spec.cases as Case[]).map((c) => {
  const r = index(c.label).search(c.q, 8);
  const given = [...r.chunks, ...(r.boxedWarning && !r.chunks.some((x) => x.sectionCode === "BW") ? [r.boxedWarning] : [])];
  const v = checkQuote(c.claim, given);
  const got = v.ok ? "keep" : v.reason;
  return { id: c.id, expect: c.expect, got, pass: got === c.expect, pendingSupport: c.support ?? null, why: c.why };
});

const passed = results.filter((r) => r.pass).length;
const pending = results.filter((r) => r.pendingSupport);
const date = new Date().toISOString().slice(0, 10);
mkdirSync(join(here, "reports"), { recursive: true });
writeFileSync(join(here, "reports", `claims-${date}.json`), JSON.stringify({ date, passed, total: results.length, results }, null, 1));
const md = [
  `# Claim-checker eval, ${date}`,
  "",
  `**${passed} of ${results.length} claims get the expected verdict** from the deterministic quote check (step 1).`,
  pending.length ? `${pending.length} claim(s) pass step 1 by design and must be stopped by the step-2 support check, not wired in yet: ${pending.map((p) => p.id).join(", ")}.` : "",
  "",
  "| Claim | Expected | Got | Result | Why |",
  "| --- | --- | --- | --- | --- |",
  ...results.map((r) => `| ${r.id} | ${r.expect}${r.pendingSupport ? ` (then ${r.pendingSupport} at step 2)` : ""} | ${r.got} | ${r.pass ? "pass" : "**FAIL**"} | ${r.why} |`),
  "",
].join("\n");
writeFileSync(join(here, "reports", `claims-${date}.md`), md);
console.log(md);
process.exit(passed === results.length ? 0 : 1);
