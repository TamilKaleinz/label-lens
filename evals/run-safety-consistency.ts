/** Live: classifies each model-tier and control question N times, without the cache, and reports how often the decision flips. */
import spec from "./refusals-v0.1.json";
import { loadConfig } from "../packages/core/src/config.js";
import { OpenAIClient } from "../packages/core/src/model.js";
import { classify } from "../packages/core/src/safety.js";
const N = Number(process.env["TRIALS"] ?? 5);
const config = loadConfig(), m = new OpenAIClient();
const cases = spec.cases.filter((c) => c.tier === "model" || c.group.startsWith("general"));
let flips = 0, wrongMajority = 0;
for (const c of cases) {
  const v = await Promise.all(Array.from({ length: N }, () => classify(c.q, m, config)));
  const counts = v.reduce<Record<string, number>>((a, x) => ({ ...a, [x.class]: (a[x.class] ?? 0) + 1 }), {});
  const flipped = Object.keys(counts).length > 1;
  if (flipped) flips++;
  console.log(`${flipped ? "FLIP" : "    "} ${c.id.padEnd(6)} ${JSON.stringify(counts)}  ${c.q}`);
}
console.log(`\n${flips} of ${cases.length} questions got more than one safety class across ${N} trials. Config ${config.hash}`);
