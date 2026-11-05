import csv, pathlib
ROOT = pathlib.Path(__file__).parent
drugs = list(csv.DictReader(open(ROOT/"demo-drugs.csv")))
cases = list(csv.DictReader(open(ROOT/"cases-v0.1.csv")))

COVER = [
 ("Multiple manufacturers in one group", ["DS-03","DS-04"]),
 ("Repackager vs original, different text", ["DS-01","DS-02","DS-06","DS-07"]),
 ("Same generic name, different product group", ["DS-01","DS-03","DS-05"]),
 ("Combination product", ["DS-06","DS-07","DS-10"]),
 ("Same moiety, different salt or release", ["DS-15","DS-16"]),
 ("One brand across routes", ["DS-17","DS-18"]),
 ("Same ingredient, different dosage form", ["DS-11","DS-12"]),
 ("Label changed in 2026 (historical applicability)", ["DS-01","DS-03","DS-05","DS-06"]),
 ("Stale label as the only source", ["DS-18"]),
 ("Unsupported format (older Rx, OTC)", ["DS-10","DS-19"]),
 ("Safety-critical Boxed Warning", ["DS-08","DS-09","DS-13","DS-14"]),
 ("Warning outside the boxed field", ["DS-15","DS-16"]),
 ("PV close-match wording", ["DS-09","DS-13"]),
]

out = []
w = out.append
w("# Demo drug set and eval cases v0.1")
w("")
w("**As of:** 2026-11-05 · **Milestone:** M1 Discovery · **PRD:** v0.3 (D-15 to D-18)")
w("")
w(f"Label Lens will be built and evaluated against **{len(drugs)} labels** chosen for the edge cases they expose, not for popularity. "
  f"**{len(cases)} eval cases** test the three foundations: picking the right label, staying grounded in it, and refusing well. "
  "Every identifier and every expected-evidence claim below was checked against the live openFDA API on 2026-11-05.")
w("")
w("> openFDA updates labels weekly. Re-verify IDs and dates before each eval run (`evals/build.py` holds the source data).")
w("")
w("## What the selection surfaced")
w("")
w("Building the set changed the product, before any code was written:")
w("")
w("1. **One generic name, three products.** \"Metformin hydrochloride\" covers immediate-release tablets, extended-release tablets and an oral solution, and the brand field doesn't distinguish them. Auto-selecting across these would answer from the wrong product. This led to equivalence groups (D-16).")
w("2. **Repackager labels can lag the original.** The A-S Medication metformin IR label (dated 2026-09-02) and its Janumet label both lack the 2026 Boxed Warning update that adds mitochondrial diseases as a lactic acidosis risk factor, even though the repackager metformin label is dated *after* the update. A dispensed product must use its own label, and differences must be disclosed (D-15, FR-F01-09).")
w("3. **One brand, two routes.** The current label for oral semaglutide reads \"RYBELSUS and OZEMPIC tablets\", while the only injectable Ozempic label in openFDA is a 2023 repackager copy. A search for \"Ozempic\" must ask which product.")
w("4. **Original packagers lag each other too.** Time Cap's metformin ER label (2025-06-30) predates the update; Granules' (2026-09-03) includes it.")
w("5. **Label structure varies.** For both metoprolol products, the ischemic heart disease warning sits in 5.1, not in the boxed-warning field. Some section fields also open with Highlights summary text before the full section, so the parser must separate them.")
w("")
w("## Coverage")
w("")
w("| Edge case | Labels |")
w("| --- | --- |")
for name, ids in COVER:
    w(f"| {name} | {', '.join(ids)} |")
w("")
w("## The labels")
w("")
w("| ID | Product | Manufacturer | Packager | Product NDC | Package NDC | SPL ID | Set ID | Ver. | Label date | Format |")
w("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
for d in drugs:
    w(f"| {d['id']} | {d['product']} | {d['manufacturer']} | {d['packager_type']} | {d['product_ndc']} | {d['package_ndc']} | `{d['spl_id']}` | `{d['set_id']}` | {d['version']} | {d['effective_date']} | {d['label_format']} |")
w("")
w("## Why each label, and what it should prove")
w("")
w("| ID | Selection rationale | Boxed Warning | Expected evidence (verified) |")
w("| --- | --- | --- | --- |")
for d in drugs:
    w(f"| {d['id']} | {d['selection_rationale']} | {d['boxed_warning']} | {d['expected_evidence']} |")
w("")
w("## Eval cases")
w("")
cats = {}
for c in cases: cats.setdefault(c['category'], []).append(c['case_id'])
w("| Category | Cases | IDs |")
w("| --- | --- | --- |")
for k, v in cats.items():
    w(f"| {k} | {len(v)} | {', '.join(v)} |")
w("")
w("Full cases, with inputs, expected label, expected behaviour, expected evidence, what must not happen, and linked requirements: [`cases-v0.1.csv`](cases-v0.1.csv).")
w("")
w("### How a case passes")
w("")
w("- **Label:** the answer comes from the expected label, or Label Lens asks when the case expects a question first (GM-07).")
w("- **Evidence:** every claim cites the expected section, and no claim falls outside the retrieved text (GM-01).")
w("- **Must not:** none of the listed failure behaviours occur. Any \"must not\" in a guardrail-linked case blocks release.")
w("- **PV:** the proposed verdict, the Provisional flag and the human-approval gate all match (GM-06, GM-08).")
w("")
w("## Known limitations (tracked, not hidden)")
w("")
w("- **Stale-but-only labels aren't flagged.** PV-08: the injectable Ozempic label in openFDA is from 2023, and the provisional rule doesn't catch it, because the label predates the case. Label history (F-08) is the fix. Until then, the label date is always shown.")
w("- **Dosage form isn't a structured field.** Equivalence grouping reads it from label text. When that's unreliable, Label Lens must ask (FR-F01-08).")
w("- **Snapshot data.** Label versions change weekly; the cases pin set IDs and dates as of 2026-11-05.")
w("")
w("---")
w("")
w("*Source: [openFDA](https://open.fda.gov) drug label API, queried 2026-11-05. Not medical advice; open research prototype.*")

(ROOT.parent/"docs"/"demo-drug-set.md").write_text("\n".join(out) + "\n")
print("ok")
