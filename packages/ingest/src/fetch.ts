/**
 * Fetches full label records for the demo set from openFDA (DEP-01).
 * Run: `OPENFDA_API_KEY=... npx tsx packages/ingest/src/fetch.ts`
 * Writes fixtures/full/<set_id>.json and checks every pinned version and date against evals/demo-drugs.csv.
 * Needs network access to api.fda.gov (CI, the deployed cron, or an allowed workspace).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.fda.gov/drug/label.json";
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

interface Pin { id: string; set_id: string; version: string; effective_date: string; spl_id: string }

function readPins(): Pin[] {
  const [head, ...rows] = readFileSync(join(root, "evals/demo-drugs.csv"), "utf8").trim().split("\n");
  const cols = (head as string).split(",");
  // The pinned columns contain no commas, so a simple split is safe for them.
  return rows.map((line) => {
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "")) ?? [];
    const get = (k: string) => cells[cols.indexOf(k)] ?? "";
    return { id: get("id"), set_id: get("set_id"), version: get("version"), effective_date: get("effective_date"), spl_id: get("spl_id") };
  });
}

export async function fetchBySetIds(setIds: string[], apiKey?: string): Promise<Record<string, unknown>[]> {
  const q = `set_id:(${setIds.map((s) => `"${s}"`).join("+")})`;
  const url = `${API}?search=${encodeURIComponent(q).replace(/%2B/g, "+")}&limit=${setIds.length}${apiKey ? `&api_key=${apiKey}` : ""}`;
  const res = await fetch(url, { headers: { "User-Agent": "label-lens-ingest/0.1" } });
  if (!res.ok) throw new Error(`openFDA ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { results: Record<string, unknown>[] };
  return body.results;
}

async function main() {
  const pins = readPins();
  const records = await fetchBySetIds(pins.map((p) => p.set_id), process.env.OPENFDA_API_KEY);
  const outDir = join(root, "fixtures/full");
  mkdirSync(outDir, { recursive: true });
  const drift: string[] = [];
  for (const p of pins) {
    const r = records.find((x) => x["set_id"] === p.set_id);
    if (!r) { drift.push(`${p.id}: missing from openFDA`); continue; }
    writeFileSync(join(outDir, `${p.set_id}.json`), JSON.stringify(r, null, 1));
    const eff = String(r["effective_time"]);
    const iso = `${eff.slice(0, 4)}-${eff.slice(4, 6)}-${eff.slice(6, 8)}`;
    if (r["version"] !== p.version || iso !== p.effective_date || r["id"] !== p.spl_id)
      drift.push(`${p.id}: pinned v${p.version} ${p.effective_date}, now v${String(r["version"])} ${iso}`);
  }
  console.log(`Fetched ${records.length} of ${pins.length} labels.`);
  if (drift.length) {
    console.log("Label drift (re-run the evals and re-pin if intended):\n" + drift.join("\n"));
    process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
