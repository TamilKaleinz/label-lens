/** Runs the live support check N times on every claim that passes the quote check; reports verdict accuracy and consistency. */
import claimSpec from "./claims-v0.1.json";
import { loadConfig } from "../packages/core/src/config.js";
import { OpenAIClient } from "../packages/core/src/model.js";
import { supportCheck } from "../packages/core/src/support.js";
import type { Claim } from "../packages/core/src/verify.js";
const N = Number(process.env["TRIALS"] ?? 5);
const check = supportCheck(new OpenAIClient(), loadConfig());
type CC = { id: string; claim: Claim; expect: string; support?: string };
const cases = (claimSpec.cases as CC[]).filter((c) => c.expect === "keep");
let correct = 0, total = 0, unstable = 0;
for (const c of cases) {
  const v = await Promise.all(Array.from({ length: N }, () => check(c.claim)));
  const want = c.support !== "unsupported";
  const right = v.filter((x) => x === want).length;
  correct += right; total += N; if (right !== 0 && right !== N) unstable++;
  console.log(`${c.id.padEnd(6)} want ${want ? "supported  " : "unsupported"}  ${v.map((x) => (x ? "S" : "U")).join("")}  ${right}/${N}`);
}
console.log(`\n${correct} of ${total} verdicts correct; ${unstable} of ${cases.length} claims inconsistent across ${N} trials. Config ${loadConfig().hash}`);
