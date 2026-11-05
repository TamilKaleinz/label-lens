/**
 * Golden-file tests (architecture doc 4.4.1, step 8): every full demo label from openFDA must keep
 * normalising to its reviewed snapshot. Refresh fixtures with `npm run ingest:fetch`; if a label
 * changed on purpose, regenerate with `npm run golden:update` and review the diff.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fullRecords, snapshot } from "./golden.js";

const golden = JSON.parse(readFileSync(join(import.meta.dirname, "golden/labels.golden.json"), "utf8")) as Record<string, unknown>;
const records = fullRecords();

describe("golden files: full openFDA labels", () => {
  it("has a snapshot for every demo label", () => {
    expect(records.map((r) => r.set_id).sort()).toEqual(Object.keys(golden).sort());
  });
  for (const r of records) {
    it(`${String((r.openfda as Record<string, string[]> | undefined)?.["brand_name"]?.[0])} (${r.set_id.slice(0, 8)})`, () => {
      expect(snapshot(r)).toEqual(golden[r.set_id]);
    });
  }
});
