import fixtures from "../../../fixtures/labels.json";
import { normalize, type OpenFdaRecord } from "../../ingest/src/normalize.js";
import { LabelStore } from "../src/resolve.js";
import type { LabelMeta } from "../src/types.js";

type Rec = OpenFdaRecord & { _demo_id: string };
const recs = fixtures.results as unknown as Rec[];

export const labels: LabelMeta[] = recs.map((r) => normalize(r));
export const store = new LabelStore(labels);
const idOf = new Map(recs.map((r, i) => [labels[i] as LabelMeta, r._demo_id]));
const labelOf = new Map(recs.map((r, i) => [r._demo_id, labels[i] as LabelMeta]));

export const demoId = (l: LabelMeta): string => idOf.get(l) ?? "?";
export const label = (id: string): LabelMeta => labelOf.get(id) as LabelMeta;
export const groupIdOf = (id: string): string => store.groupOf(label(id)).id;
