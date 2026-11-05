/**
 * Eval runner, stage 4: the answer pipeline end to end, on a deterministic mock model (GM-01, GM-07).
 * This tests plumbing and gates, not answer quality: the mock quotes excerpts verbatim. Each case
 * runs once clean and three times with an injected bad claim (fabricated quote, wrong section,
 * invented number), each of which must be dropped. Writes evals/reports/pipeline-<date>.{json,md}.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import spec from "./retrieval-expectations.json";
import { Engine, type AnswerResponse } from "../packages/core/src/answer.js";
import { loadConfig } from "../packages/core/src/config.js";
import { ExtractiveModel, ScriptedModel } from "../packages/core/src/mock.js";
import type { ModelRequest } from "../packages/core/src/model.js";
import { canonical } from "../packages/core/src/verify.js";
import { fullLabel, fullStore, sectionsFor } from "../packages/core/test/fullStore.js";

const config = loadConfig();
type Inject = { name: string; make: (first: { text: string; section_code: string; quote: string }) => { text: string; section_code: string; quote: string } };
const INJECTIONS: Inject[] = [
  { name: "fabricated quote", make: (f) => ({ text: "This is rarely a concern in practice.", section_code: f.section_code, quote: "This adverse effect is rarely a concern in clinical practice and resolves on its own." }) },
  { name: "wrong section", make: (f) => ({ ...f, section_code: f.section_code === "4" ? "6.1" : "4" }) },
  { name: "invented number", make: (f) => ({ ...f, text: `${f.text} The usual dose is 9999 mg.` }) },
];

function injecting(inj?: Inject) {
  const base = new ExtractiveModel();
  return new ScriptedModel(async (req: ModelRequest) => {
    const raw = await base.complete(req);
    if (!inj || req.purpose !== "generate") return raw;
    const o = JSON.parse(raw);
    if (!o.claims[0]) return raw;
    return JSON.stringify({ ...o, claims: [...o.claims, inj.make(o.claims[0])] });
  });
}

/** GM-01 at the output: every shown claim's quote must be, verbatim, inside its cited section. */
function shownClaimsGrounded(r: AnswerResponse, demo: string): boolean {
  if (r.kind !== "answer") return true;
  const sections = sectionsFor(fullLabel(demo));
  return r.claims.every((c) => {
    const s = sections.find((x) => x.code === c.sectionCode);
    return !!s && canonical(s.text).text.includes(canonical(c.quote).text);
  });
}

const rows: { case: string; run: string; pass: boolean; kind: string; shown: number; dropped: string; note: string }[] = [];
for (const c of spec.cases) {
  const ref = { setId: fullLabel(c.label).setId };
  for (const inj of [undefined, ...INJECTIONS]) {
    const engine = new Engine({ store: fullStore, sectionsFor, model: injecting(inj), config });
    const r = await engine.answer({ role: "pharmacist", ref, question: c.q });
    const grounded = shownClaimsGrounded(r, c.label);
    const injectedShown = !!inj && r.kind === "answer" && r.claims.some((x) => /rarely a concern|9999/.test(x.text) || x.sectionCode !== x.chunkId.split("#")[0]);
    const bwOk = r.kind !== "answer" || r.boxedWarning.present === fullLabel(c.label).hasBoxedWarning;
    const answered = inj ? true : r.kind === "answer";
    const pass = grounded && !injectedShown && bwOk && answered && r.configHash === config.hash;
    rows.push({
      case: c.case, run: inj?.name ?? "clean", pass, kind: r.kind,
      shown: r.kind === "answer" ? r.claims.length : 0,
      dropped: r.kind === "answer" || r.kind === "label_silent" ? r.dropped.reasons.join(", ") : "",
      note: [!grounded && "ungrounded claim shown", injectedShown && "injected claim shown", !bwOk && "Boxed Warning flag wrong", !answered && "no answer"].filter(Boolean).join("; "),
    });
  }
}

const passed = rows.filter((r) => r.pass).length;
const injectedRuns = rows.filter((r) => r.run !== "clean");
const caught = injectedRuns.filter((r) => r.pass).length;
const date = new Date().toISOString().slice(0, 10);
const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, "reports"), { recursive: true });
writeFileSync(join(here, "reports", `pipeline-${date}.json`), JSON.stringify({ date, configHash: config.hash, model: "mock:extractive", passed, total: rows.length, rows }, null, 1));
const md = [
  `# Pipeline eval (mock model), ${date}`,
  "",
  `Config \`${config.hash}\` · model: deterministic extractive mock. Tests plumbing and gates, not answer quality.`,
  "",
  `**${passed} of ${rows.length} runs pass.** Injected bad claims caught: ${caught} of ${injectedRuns.length}. Ungrounded claims shown: ${rows.filter((r) => r.note.includes("ungrounded")).length} (GM-01 target: 0).`,
  "",
  "| Case | Run | Result | Kind | Claims shown | Dropped | Notes |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map((r) => `| ${r.case} | ${r.run} | ${r.pass ? "pass" : "**FAIL**"} | ${r.kind} | ${r.shown} | ${r.dropped} | ${r.note} |`),
  "",
].join("\n");
writeFileSync(join(here, "reports", `pipeline-${date}.md`), md);
console.log(md.split("\n").slice(0, 6).join("\n"));
for (const r of rows.filter((x) => !x.pass)) console.log("FAIL", r.case, r.run, r.kind, r.note, r.dropped);
process.exit(passed === rows.length ? 0 : 1);
