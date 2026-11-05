/** A label store built from the FULL openFDA demo labels, with each label's sections, for pipeline tests and evals. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalize, type OpenFdaRecord } from "../../ingest/src/normalize.js";
import { sectionsOf, type Section } from "../../ingest/src/sections.js";
import { LabelStore } from "../src/resolve.js";
import type { LabelMeta } from "../src/types.js";

const root = join(import.meta.dirname, "../../..");
const [head, ...rows] = readFileSync(join(root, "evals/demo-drugs.csv"), "utf8").trim().split("\n");
const cols = (head as string).split(",");
const demoOfSet = new Map(rows.map((r) => {
  const cells = r.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "")) ?? [];
  return [cells[cols.indexOf("set_id")] as string, cells[cols.indexOf("id")] as string];
}));

const records = readdirSync(join(root, "fixtures/full")).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(root, "fixtures/full", f), "utf8")) as OpenFdaRecord);
const metas = records.map((r) => normalize(r));
const sectionsBySet = new Map(records.map((r) => [r.set_id, sectionsOf(r)]));

export const fullStore = new LabelStore(metas);
export const sectionsFor = (l: LabelMeta): Section[] => sectionsBySet.get(l.setId) ?? [];
export const fullLabel = (demo: string): LabelMeta => metas.find((m) => demoOfSet.get(m.setId) === demo) as LabelMeta;
export const demoOf = (l: LabelMeta): string => demoOfSet.get(l.setId) ?? "?";
