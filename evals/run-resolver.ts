/**
 * Eval runner, stage 1: label resolution and the provisional rule (GM-07, GM-08).
 * Reads evals/resolver-expectations.json, runs each case against the fixture label store,
 * writes evals/reports/resolver-<date>.{json,md}, and exits non-zero if any case fails.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import expectations from "./resolver-expectations.json";
import { resolve } from "../packages/core/src/resolve.js";
import { provisionalFor } from "../packages/core/src/provisional.js";
import type { LabelRef, ResolveResult, Role } from "../packages/core/src/types.js";
import { demoId, groupIdOf, label, store } from "../packages/core/test/fixtureStore.js";

type Exp = {
  status: string; kind?: string; label?: string; representative?: boolean;
  minGroups?: number; mustIncludeGroupsOf?: string[]; provisional?: boolean;
};
type Case = { case: string; role: Role; ref: Record<string, string>; receiptDate?: string; expect: Exp; note?: string };

function toRef(r: Record<string, string>): LabelRef {
  if (r.ndc) return { ndc: r.ndc };
  if (r.q) return { q: r.q };
  if (r.groupOf) return { groupId: groupIdOf(r.groupOf) };
  if (r.setOf) return { setId: label(r.setOf).setId };
  throw new Error(`bad ref ${JSON.stringify(r)}`);
}

function check(c: Case, res: ResolveResult): string[] {
  const e = c.expect, fails: string[] = [];
  if (res.status !== e.status) fails.push(`status ${res.status}, expected ${e.status}`);
  const got = "label" in res ? demoId(res.label) : undefined;
  if (e.label && got !== e.label) fails.push(`label ${got ?? "none"}, expected ${e.label}`);
  if (e.representative !== undefined && res.status === "resolved" && res.representative !== e.representative)
    fails.push(`representative ${res.representative}, expected ${e.representative}`);
  if (res.status === "needs_choice") {
    if (e.kind && res.kind !== e.kind) fails.push(`choice kind ${res.kind}, expected ${e.kind}`);
    const ids = res.kind === "group" ? res.groups.map((g) => g.groupId) : [res.groupId];
    if (e.minGroups && ids.length < e.minGroups) fails.push(`${ids.length} groups, expected at least ${e.minGroups}`);
    for (const d of e.mustIncludeGroupsOf ?? []) if (!ids.includes(groupIdOf(d))) fails.push(`missing group of ${d}`);
  }
  if (e.provisional !== undefined && res.status === "resolved") {
    const p = provisionalFor(res.label, c.receiptDate);
    if (p.provisional !== e.provisional) fails.push(`provisional ${p.provisional}, expected ${e.provisional}`);
  }
  return fails;
}

const cases = expectations.cases as unknown as Case[];
const results = cases.map((c) => {
  const res = resolve(store, toRef(c.ref), c.role);
  const fails = check(c, res);
  return { case: c.case, pass: fails.length === 0, status: res.status, label: "label" in res ? demoId(res.label) : null, fails, note: c.note ?? null };
});

const passed = results.filter((r) => r.pass).length;
const date = new Date().toISOString().slice(0, 10);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "reports");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `resolver-${date}.json`), JSON.stringify({ date, passed, total: results.length, results }, null, 1));
const md = [
  `# Resolver eval, ${date}`,
  "",
  `**${passed} of ${results.length} cases pass.** Guardrails checked: GM-07 (wrong label), GM-08 (provisional flag).`,
  "",
  "| Case | Result | Status | Label | Notes |",
  "| --- | --- | --- | --- | --- |",
  ...results.map((r) => `| ${r.case} | ${r.pass ? "pass" : "**FAIL**"} | ${r.status} | ${r.label ?? ""} | ${[...r.fails, r.note ?? ""].filter(Boolean).join("; ")} |`),
  "",
].join("\n");
writeFileSync(join(outDir, `resolver-${date}.md`), md);
console.log(md);
process.exit(passed === results.length ? 0 : 1);
