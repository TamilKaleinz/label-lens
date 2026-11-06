/** Debug one question live: prints the excerpts' section codes, the raw model claims, and each check verdict. */
import { loadConfig } from "../packages/core/src/config.js";
import { OpenAIClient } from "../packages/core/src/model.js";
import { LabelIndex } from "../packages/core/src/retrieve.js";
import { excerptsFor, generate } from "../packages/core/src/generate.js";
import { checkQuote } from "../packages/core/src/verify.js";
import { fullLabel, sectionsFor } from "../packages/core/test/fullStore.js";
const [demo, ...q] = process.argv.slice(2);
const config = loadConfig(); const label = fullLabel(demo!);
const r = new LabelIndex(sectionsFor(label), config.retrieval).search(q.join(" "), config.retrieval.k);
const ex = excerptsFor(r);
console.log("excerpts:", ex.map((c) => c.id).join(" "));
const g = await generate(new OpenAIClient(), config, "pharmacist", q.join(" "), label, ex);
if (!g.ok) { console.log(g.error); process.exit(1); }
for (const c of g.claims) { const v = checkQuote(c, ex); console.log(`\n[${c.sectionCode}] ${v.ok ? "keep" : v.reason}\n  claim: ${c.text}\n  quote: ${c.quote}`); }
