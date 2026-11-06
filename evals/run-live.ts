/**
 * Live eval against the real OpenAI models in config/models.json. Not run in CI by default: it
 * costs money and needs OPENAI_API_KEY. Run with `npm run eval:live`.
 *
 * Part A, support check: the claims from claims-v0.1.json that pass the quote check are sent to
 *   the gate model. Faithful claims must be supported; UC-04 must not be.
 * Part B, pipeline: each retrieval case is answered RUNS times as a pharmacist. Reports answer
 *   rate, whether an expected section is cited, ungrounded claims shown (GM-01, must be 0), drops,
 *   run-to-run agreement on cited sections, latency and tokens. Cases that ask for patient-specific
 *   advice are listed for review: the safety classifier that should refuse them is M3.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import claimSpec from "./claims-v0.1.json";
import spec from "./retrieval-expectations.json";
import { Engine, type AnswerResponse } from "../packages/core/src/answer.js";
import { loadConfig } from "../packages/core/src/config.js";
import { OpenAIClient } from "../packages/core/src/model.js";
import { supportCheck } from "../packages/core/src/support.js";
import { canonical, type Claim } from "../packages/core/src/verify.js";
import { fullLabel, fullStore, sectionsFor } from "../packages/core/test/fullStore.js";

const RUNS = Number(process.env["LIVE_RUNS"] ?? 2);
const PERSONAL = new Set(["RF-01", "RF-06"]);
const OFF_LABEL = new Set(["RF-03"]);
const config = loadConfig();
const client = new OpenAIClient(undefined, undefined, 120_000);
const here = dirname(fileURLToPath(import.meta.url));
const matches = (want: string, code: string) => (want.endsWith("*") ? code === want.slice(0, -1) || code.startsWith(`${want.slice(0, -1)}.`) : code === want);

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const j = i++; out[j] = await fn(items[j] as T); }
  }));
  return out;
}

// ---------- Part A: support check ----------
type CC = { id: string; claim: Claim; expect: string; support?: string };
const keepCases = (claimSpec.cases as CC[]).filter((c) => c.expect === "keep");
const support = supportCheck(client, config);
const partA = await pool(keepCases, 4, async (c) => {
  const supported = await support(c.claim);
  const want = c.support !== "unsupported";
  return { id: c.id, want, supported, pass: supported === want, claim: c.claim.text };
});

// ---------- Part B: pipeline ----------
const engine = new Engine({ store: fullStore, sectionsFor, model: client, config });
const jobs = spec.cases.flatMap((c) => Array.from({ length: RUNS }, (_, run) => ({ c, run })));
const partB = await pool(jobs, 4, async ({ c, run }) => {
  const t0 = Date.now();
  const r: AnswerResponse = await engine.answer({ role: "pharmacist", ref: { setId: fullLabel(c.label).setId }, question: c.q });
  const ms = Date.now() - t0;
  const claims = r.kind === "answer" ? r.claims : [];
  const sections = sectionsFor(fullLabel(c.label));
  const ungrounded = claims.filter((x) => {
    const s = sections.find((y) => y.code === x.sectionCode);
    return !s || !canonical(s.text).text.includes(canonical(x.quote).text);
  }).length;
  const cited = [...new Set(claims.map((x) => x.sectionCode))];
  const hitExpected = c.expect.some((w) => cited.some((code) => matches(w, code)));
  return {
    case: c.case, run, q: c.q, kind: r.kind, ms, cited, hitExpected, ungrounded,
    dropped: r.kind === "answer" || r.kind === "label_silent" ? r.dropped.reasons : [],
    error: r.kind === "label_silent" ? r.error ?? null : null,
    claims: claims.map((x) => `[${x.sectionCode}] ${x.text}`),
  };
});

// ---------- report ----------
const byCase = new Map<string, typeof partB>();
for (const r of partB) byCase.set(r.case, [...(byCase.get(r.case) ?? []), r]);
const agreement = [...byCase.values()].map((rs) => {
  const sets = rs.map((r) => new Set(r.cited));
  const a = sets[0] ?? new Set<string>(), b = sets[1] ?? a;
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 1 : [...a].filter((x) => b.has(x)).length / union.size;
});
const answerable = partB.filter((r) => !PERSONAL.has(r.case) && !OFF_LABEL.has(r.case));
const pct = (n: number, d: number) => `${n} of ${d} (${Math.round((100 * n) / Math.max(1, d))}%)`;
const allDrops = partB.flatMap((r) => r.dropped);
const dropCounts = Object.entries(allDrops.reduce<Record<string, number>>((m, d) => ({ ...m, [d]: (m[d] ?? 0) + 1 }), {}));
const u = client.usage;
const summary = {
  date: new Date().toISOString().slice(0, 10), configHash: config.hash, models: config.models, runs: RUNS,
  supportCheck: { passed: partA.filter((x) => x.pass).length, total: partA.length },
  answered: answerable.filter((r) => r.kind === "answer").length, answerableRuns: answerable.length,
  citedExpected: answerable.filter((r) => r.hitExpected).length,
  ungroundedShown: partB.reduce((n, r) => n + r.ungrounded, 0),
  claimsShown: partB.reduce((n, r) => n + r.claims.length, 0), claimsDropped: allDrops.length,
  meanSectionAgreement: agreement.reduce((a, b) => a + b, 0) / Math.max(1, agreement.length),
  medianMs: [...partB.map((r) => r.ms)].sort((a, b) => a - b)[Math.floor(partB.length / 2)],
  usage: u,
};
mkdirSync(join(here, "reports"), { recursive: true });
writeFileSync(join(here, "reports", `live-${summary.date}.json`), JSON.stringify({ summary, partA, partB }, null, 1));

const md = [
  `# Live eval, ${summary.date}`,
  "",
  `Config \`${config.hash}\` · generate: \`${config.models.generate.model}\` · gate: \`${config.models.gate.model}\` · ${RUNS} runs per case · role: pharmacist`,
  "",
  "## Summary",
  "",
  "| Measure | Result |",
  "| --- | --- |",
  `| Support check verdicts correct (Part A) | ${pct(summary.supportCheck.passed, summary.supportCheck.total)} |`,
  `| Answerable runs that produced an answer | ${pct(summary.answered, summary.answerableRuns)} |`,
  `| Answerable runs citing an expected section | ${pct(summary.citedExpected, summary.answerableRuns)} |`,
  `| Ungrounded claims shown (GM-01, target 0) | ${summary.ungroundedShown} |`,
  `| Claims shown / dropped by the checker | ${summary.claimsShown} / ${summary.claimsDropped} (${dropCounts.map(([k, v]) => `${k} ${v}`).join(", ") || "none"}) |`,
  `| Run-to-run agreement on cited sections | ${(summary.meanSectionAgreement * 100).toFixed(0)}% |`,
  `| Median latency per answer | ${((summary.medianMs ?? 0) / 1000).toFixed(1)} s |`,
  `| Tokens, generate | ${u.generate.calls} calls, ${u.generate.inputTokens} in, ${u.generate.outputTokens} out |`,
  `| Tokens, support check | ${u.support.calls} calls, ${u.support.inputTokens} in, ${u.support.outputTokens} out |`,
  "",
  "## Part A: support check",
  "",
  "| Claim | Should be supported | Verdict | Result | Claim text |",
  "| --- | --- | --- | --- | --- |",
  ...partA.map((x) => `| ${x.id} | ${x.want ? "yes" : "no"} | ${x.supported ? "supported" : "not supported"} | ${x.pass ? "pass" : "**FAIL**"} | ${x.claim} |`),
  "",
  "## Part B: answers",
  "",
  "| Case | Run | Kind | Cited | Expected hit | Dropped | Seconds |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...partB.map((r) => `| ${r.case}${PERSONAL.has(r.case) ? " (personal advice)" : OFF_LABEL.has(r.case) ? " (off-label)" : ""} | ${r.run + 1} | ${r.kind}${r.error ? `: ${r.error}` : ""} | ${r.cited.join(", ")} | ${r.hitExpected ? "yes" : "no"} | ${r.dropped.join(", ")} | ${(r.ms / 1000).toFixed(1)} |`),
  "",
  "## For review: questions the M3 safety classifier must handle",
  "",
  ...partB.filter((r) => PERSONAL.has(r.case) || OFF_LABEL.has(r.case)).flatMap((r) => [`**${r.case} run ${r.run + 1}:** "${r.q}" → ${r.kind}`, "", ...r.claims.map((c) => `- ${c}`), ""]),
  "## All claims shown (first run)",
  "",
  ...partB.filter((r) => r.run === 0).flatMap((r) => [`**${r.case}:** ${r.q}`, "", ...(r.claims.length ? r.claims.map((c) => `- ${c}`) : ["- (none)"]), ""]),
].join("\n");
writeFileSync(join(here, "reports", `live-${summary.date}.md`), md);
console.log(md.split("\n## Part A")[0]);
