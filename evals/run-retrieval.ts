/**
 * Eval runner, stage 2: label-scoped retrieval (FR-F03-01; feeds GM-01).
 * Runs each case against the FULL openFDA label for its demo drug, writes
 * evals/reports/retrieval-<date>.{json,md}, and exits non-zero if any case fails.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import spec from "./retrieval-expectations.json";
import { LabelIndex } from "../packages/core/src/retrieve.js";
import { sectionsOf } from "../packages/ingest/src/sections.js";

const here = dirname(fileURLToPath(import.meta.url));
const [head, ...rows] = readFileSync(join(here, "demo-drugs.csv"), "utf8").trim().split("\n");
const cols = (head as string).split(",");
const setIdOf = new Map(rows.map((r) => {
  const cells = r.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "")) ?? [];
  return [cells[cols.indexOf("id")] as string, cells[cols.indexOf("set_id")] as string];
}));

const indexes = new Map<string, LabelIndex>();
function indexFor(demo: string): LabelIndex {
  let ix = indexes.get(demo);
  if (!ix) {
    const rec = JSON.parse(readFileSync(join(here, "../fixtures/full", `${setIdOf.get(demo)}.json`), "utf8"));
    ix = new LabelIndex(sectionsOf(rec));
    indexes.set(demo, ix);
  }
  return ix;
}

const matches = (want: string, code: string) => (want.endsWith("*") ? code === want.slice(0, -1) || code.startsWith(`${want.slice(0, -1)}.`) : code === want);

const results = spec.cases.map((c) => {
  const r = indexFor(c.label).search(c.q, spec.k);
  const got = r.chunks.map((x) => x.sectionCode);
  // Strict: the Boxed Warning counts only if it ranked on its own merit, not because it is always attached.
  const missing = c.expect.filter((w) => !got.some((code) => matches(w, code)));
  return { case: c.case, label: c.label, q: c.q, pass: missing.length === 0, top: got, intents: r.intents, missing };
});

const passed = results.filter((r) => r.pass).length;
const expected = spec.cases.reduce((n, c) => n + c.expect.length, 0);
const found = expected - results.reduce((n, r) => n + r.missing.length, 0);
const date = new Date().toISOString().slice(0, 10);
mkdirSync(join(here, "reports"), { recursive: true });
writeFileSync(join(here, "reports", `retrieval-${date}.json`), JSON.stringify({ date, k: spec.k, passed, total: results.length, sectionRecall: found / expected, results }, null, 1));
const md = [
  `# Retrieval eval, ${date}`,
  "",
  `**${passed} of ${results.length} cases pass** (expected sections must rank in the top ${spec.k}; the always-attached Boxed Warning doesn't count). Expected sections found: ${found} of ${expected}.`,
  "",
  "| Case | Label | Question | Result | Top sections | Missing |",
  "| --- | --- | --- | --- | --- | --- |",
  ...results.map((r) => `| ${r.case} | ${r.label} | ${r.q} | ${r.pass ? "pass" : "**FAIL**"} | ${r.top.join(", ")} | ${r.missing.join(", ")} |`),
  "",
].join("\n");
writeFileSync(join(here, "reports", `retrieval-${date}.md`), md);
console.log(md);
process.exit(passed === results.length ? 0 : 1);
