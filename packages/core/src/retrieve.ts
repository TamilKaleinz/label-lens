/**
 * Label-scoped retriever (architecture doc 4.4.4; PRD FR-F03-01).
 *
 * Searches the chunks of ONE resolved label version and nothing else. Ranking is BM25 full-text
 * search with section priors: a dose question favours Dosage and Administration and the renal and
 * hepatic subsections, a safety question favours the Boxed Warning and Warnings and Precautions.
 * The Boxed Warning is always returned beside the results, so the answer can flag it (FR-F03-04).
 *
 * Deterministic and dependency-free: the same code runs in tests, evals and the API, and Postgres
 * full-text search can replace the in-memory index later without changing the contract.
 */
import type { Section } from "../../ingest/src/sections.js";

export interface Chunk {
  /** "5.3#0": section code, then the window number inside that section. */
  id: string;
  sectionCode: string;
  sectionTitle: string;
  text: string;
}

export interface ScoredChunk extends Chunk {
  score: number;
}

export interface Retrieval {
  chunks: ScoredChunk[];
  boxedWarning?: Chunk;
  /** Which section priors the question triggered, for the evidence panel and eval reports. */
  intents: Intent[];
}

// ---------- chunking ----------

/**
 * One chunk per leaf unit: a subsection, or a section that has no subsections. A parent section
 * whose subsections were found is not indexed itself, so no text is indexed twice. Long units are
 * split on sentence boundaries; a chunk never crosses a subsection boundary.
 */
export function chunkLabel(sections: Section[], maxChars = 1200): Chunk[] {
  const codes = new Set(sections.map((s) => s.code));
  const hasChildren = (code: string) => [...codes].some((c) => c.startsWith(`${code}.`));
  const out: Chunk[] = [];
  for (const s of sections) {
    if (s.kind === "section" && hasChildren(s.code)) continue;
    windows(s.text, maxChars).forEach((text, i) =>
      out.push({ id: `${s.code}#${i}`, sectionCode: s.code, sectionTitle: s.title, text }),
    );
  }
  return out;
}

function windows(text: string, maxChars: number): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxChars) return [t];
  // Split after a full stop followed by a capital, so "e.g. Sulfonylurea" and "2.5 mg" stay whole.
  const sentences = t.split(/(?<=[.;:])\s+(?=[A-Z[(])/);
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + s.length + 1 > maxChars) {
      out.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}

// ---------- text processing ----------

const STOP = new Set(
  ("a an and are as at be been by can could did do does for from had has have how i if in into is it its " +
    "label labels me my of on or say says should so than that the their them then there these they this " +
    "to was we were what when where which who will with would you your about any there list lists tell " +
    "mention mentions cover covers drug medicine medication patient patients use used using take taking")
    .split(" "),
);

/** Lay and clinical words that should find the label's vocabulary. */
const SYNONYMS: Record<string, string[]> = {
  kidney: ["renal"], kidneys: ["renal"], egfr: ["renal"], dialysis: ["renal", "hemodialysis"],
  liver: ["hepatic"], hepatotoxicity: ["hepatic", "liver", "injury"],
  pregnant: ["pregnancy"], pregnancy: ["pregnancy", "fetal"],
  breastfeeding: ["lactation"], nursing: ["lactation"],
  child: ["pediatric"], children: ["pediatric"], kids: ["pediatric"],
  elderly: ["geriatric"], older: ["geriatric"],
  crush: ["crushed", "chewed", "whole", "swallow"], crushed: ["crush", "chewed", "whole", "swallow"],
  split: ["broken", "whole"], chew: ["chewed", "whole"],
  contrast: ["iodinated", "contrast"], imaging: ["iodinated", "contrast"],
  surgery: ["surgical", "procedures", "anesthesia"],
  interaction: ["interactions", "concomitant"], interact: ["interactions", "concomitant"],
  stop: ["discontinue", "cessation"], stopping: ["discontinue", "cessation"],
  side: ["adverse"], effects: ["reactions"],
  dose: ["dosage", "dose"], dosing: ["dosage", "dose"],
  taken: ["dosage", "administration", "meals"], take: ["dosage", "administration"], given: ["dosage", "administration"],
  store: ["storage"], stored: ["storage"], storing: ["storage"],
  allergic: ["hypersensitivity", "anaphylaxis"],
};

export function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("es") && !w.endsWith("ses")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

function queryTokens(question: string): string[] {
  const raw = question.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);
  const out = new Set<string>();
  for (const w of raw) {
    if (!STOP.has(w) && w.length > 1) out.add(stem(w));
    for (const s of SYNONYMS[w] ?? []) out.add(stem(s));
  }
  return [...out];
}

// ---------- section priors ----------

export type Intent = "dosing" | "safety" | "interaction" | "population" | "contraindication" | "indication" | "adverse" | "storage";

const INTENTS: { intent: Intent; cue: RegExp; sections: RegExp }[] = [
  { intent: "dosing", cue: /\b(dos(e|es|ing|age)|mg|crush|chew|split|administ|titrat|missed|renal|kidney|egfr|hepatic|liver impair|how (should|do|to) .*\b(take|taken|give|given))/i, sections: /^(2(\.|$)|3$|8\.[67]$)/ },
  { intent: "safety", cue: /\b(risk|warn|danger|safe|boxed|toxic|cause|harm|fatal|death|precaution)/i, sections: /^(BW|5(\.|$))/ },
  { intent: "interaction", cue: /\b(interact|with (an? )?[a-z]+|together|combin|concomitant|grapefruit|juice|alcohol|food)/i, sections: /^7(\.|$)/ },
  { intent: "population", cue: /\b(pregnan|breastfe|lactat|nursing|pediatric|child|kids|elderly|geriatric|older adult)/i, sections: /^8(\.|$)/ },
  { intent: "contraindication", cue: /\b(contraindicat|should not|must not|can'?t take|cannot take|avoid)/i, sections: /^4$/ },
  { intent: "indication", cue: /\b(indicat|used for|approved for|treat)/i, sections: /^1(\.|$)/ },
  { intent: "adverse", cue: /\b(side effect|adverse|reaction|common)/i, sections: /^6(\.|$)/ },
  { intent: "storage", cue: /\b(stor|temperature|supplied|refrigerat|shelf)/i, sections: /^16(\.|$)/ },
];

const PRIOR = 1.6;

export function intentsOf(question: string): Intent[] {
  return INTENTS.filter((i) => i.cue.test(question)).map((i) => i.intent);
}

// ---------- BM25 over one label ----------

export class LabelIndex {
  readonly chunks: Chunk[];
  readonly boxedWarning?: Chunk;
  private readonly tf: Map<string, number>[];
  private readonly len: number[];
  private readonly df = new Map<string, number>();
  private readonly avgLen: number;

  constructor(sections: Section[]) {
    this.chunks = chunkLabel(sections);
    this.boxedWarning = this.chunks.find((c) => c.sectionCode === "BW");
    // The chunk text already starts with its heading ("5.3 Hepatic Injury …"). Counting titles twice
    // was tried and changed no eval result, so it was removed.
    const docs = this.chunks.map((c) => tokens(c.text));
    this.tf = docs.map((d) => {
      const m = new Map<string, number>();
      for (const w of d) m.set(w, (m.get(w) ?? 0) + 1);
      return m;
    });
    this.len = docs.map((d) => d.length);
    this.avgLen = this.len.reduce((a, b) => a + b, 0) / Math.max(1, this.len.length);
    for (const m of this.tf) for (const w of m.keys()) this.df.set(w, (this.df.get(w) ?? 0) + 1);
  }

  search(question: string, k = 5): Retrieval {
    const q = queryTokens(question);
    const intents = intentsOf(question);
    const priors = INTENTS.filter((i) => intents.includes(i.intent)).map((i) => i.sections);
    const N = this.chunks.length;
    const k1 = 1.2, b = 0.75;
    const scored = this.chunks.map((c, i) => {
      const tf = this.tf[i] as Map<string, number>;
      let s = 0;
      for (const w of q) {
        const f = tf.get(w);
        if (!f) continue;
        const n = this.df.get(w) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * (this.len[i] as number)) / this.avgLen)));
      }
      if (s > 0 && priors.some((p) => p.test(c.sectionCode))) s *= PRIOR;
      return { ...c, score: s };
    });
    // At most two chunks per section, so one long section can't crowd out the others.
    const perSection = new Map<string, number>();
    const chunks = scored
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .filter((c) => {
        const n = perSection.get(c.sectionCode) ?? 0;
        perSection.set(c.sectionCode, n + 1);
        return n < 2;
      })
      .slice(0, k);
    return { chunks, boxedWarning: this.boxedWarning, intents };
  }
}
