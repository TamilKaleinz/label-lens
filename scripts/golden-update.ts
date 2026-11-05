/** Regenerates packages/ingest/test/golden/labels.golden.json. Review the diff before committing. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fullRecords, snapshot } from "../packages/ingest/test/golden.js";
const out: Record<string, unknown> = {};
for (const r of fullRecords()) out[r.set_id] = snapshot(r);
writeFileSync(join(import.meta.dirname, "../packages/ingest/test/golden/labels.golden.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`Wrote ${Object.keys(out).length} snapshots.`);
