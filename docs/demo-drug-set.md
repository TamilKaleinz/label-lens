# Demo drug set and eval cases v0.1

**As of:** 2026-11-05 · **Milestone:** M1 Discovery · **PRD:** v0.3 (D-15 to D-18)

Label Lens will be built and evaluated against **19 labels** chosen for the edge cases they expose, not for popularity. **48 eval cases** test the three foundations: picking the right label, staying grounded in it, and refusing well. Every identifier and every expected-evidence claim below was checked against the live openFDA API on 2026-11-05.

> openFDA updates labels weekly. Re-verify IDs and dates before each eval run (`evals/build.py` holds the source data).

## What the selection surfaced

Building the set changed the product, before any code was written:

1. **One generic name, three products.** "Metformin hydrochloride" covers immediate-release tablets, extended-release tablets and an oral solution, and the brand field doesn't distinguish them. Auto-selecting across these would answer from the wrong product. This led to equivalence groups (D-16).
2. **Repackager labels can lag the original.** The A-S Medication metformin IR label (dated 2026-09-02) and its Janumet label both lack the 2026 Boxed Warning update that adds mitochondrial diseases as a lactic acidosis risk factor, even though the repackager metformin label is dated *after* the update. A dispensed product must use its own label, and differences must be disclosed (D-15, FR-F01-09).
3. **One brand, two routes.** The current label for oral semaglutide reads "RYBELSUS and OZEMPIC tablets", while the only injectable Ozempic label in openFDA is a 2023 repackager copy. A search for "Ozempic" must ask which product.
4. **Original packagers lag each other too.** Time Cap's metformin ER label (2025-06-30) predates the update; Granules' (2026-09-03) includes it.
5. **Label structure varies.** For both metoprolol products, the ischemic heart disease warning sits in 5.1, not in the boxed-warning field. Some section fields also open with Highlights summary text before the full section, so the parser must separate them.

## Coverage

| Edge case | Labels |
| --- | --- |
| Multiple manufacturers in one group | DS-03, DS-04 |
| Repackager vs original, different text | DS-01, DS-02, DS-06, DS-07 |
| Same generic name, different product group | DS-01, DS-03, DS-05 |
| Combination product | DS-06, DS-07, DS-10 |
| Same moiety, different salt or release | DS-15, DS-16 |
| One brand across routes | DS-17, DS-18 |
| Same ingredient, different dosage form | DS-11, DS-12 |
| Label changed in 2026 (historical applicability) | DS-01, DS-03, DS-05, DS-06 |
| Stale label as the only source | DS-18 |
| Unsupported format (older Rx, OTC) | DS-10, DS-19 |
| Safety-critical Boxed Warning | DS-08, DS-09, DS-13, DS-14 |
| Warning outside the boxed field | DS-15, DS-16 |
| PV close-match wording | DS-09, DS-13 |

## The labels

| ID | Product | Manufacturer | Packager | Product NDC | Package NDC | SPL ID | Set ID | Ver. | Label date | Format |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DS-01 | Metformin HCl tablets (immediate-release) | Aurobindo Pharma Limited | Original | 65862-008 | 65862-008-50 | `61f56acf-2add-4ee0-ad61-9dc5334cfc6a` | `4ac6d01a-af26-44e7-ae2e-3618de0080aa` | 17 | 2026-07-15 | PLR Rx |
| DS-02 | Metformin HCl tablets (immediate-release) | A-S Medication Solutions | Repackager | 50090-8043 | 50090-8043-0 | `017fc887-de17-4f26-a715-b28bc6271e09` | `b6d7edc9-93d6-4480-906d-55c18d053600` | 1 | 2026-09-02 | PLR Rx |
| DS-03 | Metformin HCl extended-release tablets | Granules India Ltd | Original | 62207-496 | 62207-496-54 | `5a918a65-96d8-917d-e063-6294a90acc1d` | `73197cb5-3e23-4ac0-b189-f9bc848bce66` | 7 | 2026-09-03 | PLR Rx |
| DS-04 | Metformin HCl extended-release tablets | Time Cap Laboratories, Inc | Original | 49483-623 | 49483-623-09 | `4d845f5a-3ab1-b5ac-e063-6394a90a75d6` | `1d8b8970-c2a1-4780-be87-ab8ccfd401fa` | 10 | 2025-06-30 | PLR Rx |
| DS-05 | Metformin HCl oral solution | Camber Pharmaceuticals, Inc. | Original | 31722-042 | 31722-042-47 | `5af39aa6-2d68-870a-e063-6394a90a1560` | `7cc02a26-5c22-445b-ad8f-3e7570c143d3` | 2 | 2026-09-08 | PLR Rx |
| DS-06 | Janumet (sitagliptin and metformin HCl) | Merck Sharp & Dohme LLC | Original | 0006-0575 | 0006-0575-82 | `61bde692-38c6-42dc-aaac-503cc7e1d8f8` | `d19c7ed0-ad5c-426e-b2df-722508f97d67` | 61 | 2026-08-11 | PLR Rx |
| DS-07 | Janumet (sitagliptin and metformin HCl) | A-S Medication Solutions | Repackager | 50090-5616 | 50090-5616-0 | `baa669a4-264f-43fa-8a72-bf48fe998729` | `b55ee3d9-7f0b-4dd9-9213-fbc69f09f567` | 13 | 2026-07-09 | PLR Rx |
| DS-08 | Warfarin sodium tablets | Teva Pharmaceuticals USA, Inc. | Original | 0093-1712 | 0093-1712-01 | `b8c33971-54b3-4971-bf7f-1bec66999a29` | `0cbce382-9c88-4f58-ae0f-532a841e8f95` | 20 | 2025-06-17 | PLR Rx |
| DS-09 | Lisinopril tablets | Aurobindo Pharma Limited | Original | 65862-037 | 65862-037-30 | `99502ee9-cea6-473a-91c1-e4b4ded719e2` | `0e6364a4-6d66-4151-8197-d45e2a762895` | 27 | 2026-07-21 | PLR Rx |
| DS-10 | Lisinopril and hydrochlorothiazide tablets | Aurobindo Pharma Limited | Original | 65862-043 | 65862-043-30 | `1adb1ec1-dcf6-4f50-8e0e-cdf58c2d84c2` | `d7214539-6c3d-466a-a474-6fde096fa182` | 21 | 2026-07-21 | Older non-PLR Rx |
| DS-11 | Synthroid (levothyroxine sodium tablets) | AbbVie Inc. | Original | 0074-4341 | 0074-4341-13 | `b85ab7fa-ba96-43cd-b736-44b3924e644c` | `1e11ad30-1041-4520-10b0-8f9d30d30fcc` | 1537 | 2024-02-20 | PLR Rx |
| DS-12 | Tirosint-SOL (levothyroxine sodium oral solution) | IBSA Pharma Inc. | Original | 71858-0105 | 71858-0105-6 | `4e04737b-8d88-7c75-e063-6394a90a34c0` | `5d378add-f13d-40f2-99dc-0f2340ab44b7` | 18 | 2026-03-27 | PLR Rx |
| DS-13 | Amiodarone HCl tablets | Dr. Reddy's Laboratories Inc. | Original | 75907-005 | 75907-005-30 | `e0bc8f4a-dc9b-7804-4479-ebe732449569` | `95cef33b-c0e6-b17c-7cbb-f5c066872705` | 2 | 2026-04-23 | PLR Rx |
| DS-14 | Clopidogrel tablets | Westminster Pharmaceuticals, LLC | Original | 69367-194 | 69367-194-30 | `e988b70b-0906-4e72-b032-97033e37aa0e` | `bb3b5e96-e629-4db5-8ad5-40c17c6dae18` | 8 | 2026-09-29 | PLR Rx |
| DS-15 | Metoprolol succinate extended-release tablets | Granules India Ltd | Original | 62207-130 | 62207-130-54 | `5aa3c876-3d09-cea0-e063-6294a90a0e70` | `c5431c8a-d92c-489e-b63b-4b9cc8f32a1a` | 3 | 2026-09-04 | PLR Rx |
| DS-16 | Lopressor (metoprolol tartrate tablets) | Validus Pharmaceuticals LLC | Original | 30698-458 | 30698-458-01 | `28c4fc69-5609-49ec-8fe5-4d7bc8f88288` | `0283bc9d-6998-493a-824a-d4c85f704111` | 10 | 2023-09-14 | PLR Rx |
| DS-17 | Ozempic / Rybelsus tablets (oral semaglutide) | Novo Nordisk Pharmaceutical Industries, LP | Original | 0169-1715 | 0169-1715-30 | `6834044a-22f1-4f35-b846-b3448ee84c16` | `27f15fac-7d98-4114-a2ec-92494a91da98` | 14 | 2026-01-30 | PLR Rx |
| DS-18 | Ozempic injection (semaglutide) | A-S Medication Solutions | Repackager | 50090-6051 | 50090-6051-0 | `52d28c75-c5a5-4389-abff-8a243ba26d99` | `e6da837c-0da0-41d6-973c-5559bf764367` | 6 | 2023-11-17 | PLR Rx |
| DS-19 | Tylenol Extra Strength (acetaminophen) | Kenvue Brands LLC | Original | 50580-590 | 50580-590-01 | `22d94fd9-9488-a812-e063-6394a90a7ffc` | `015a6179-bacb-452d-b594-4de628ddc11d` | 11 | 2024-11-07 | OTC Drug Facts |

## Why each label, and what it should prove

| ID | Selection rationale | Boxed Warning | Expected evidence (verified) |
| --- | --- | --- | --- |
| DS-01 | Current IR original; reference for the 2026 Boxed Warning update | Lactic acidosis (updated 04/2026; lists mitochondrial diseases) | BW + 5.1 Lactic Acidosis incl. mitochondrial diseases; eGFR in D&A, 4 Contraindications, 8.6; iodinated contrast in 5.1 and D&A; Lactation 8.2; grapefruit not mentioned |
| DS-02 | Repackager label carries older Boxed Warning text than the current original, despite a newer label date | Lactic acidosis (older text; no mitochondrial diseases) | BW lacks 'mitochondrial'; no Recent Major Changes; otherwise same sections as DS-01 |
| DS-03 | Same generic name as IR but a different product group; current ER text | Lactic acidosis (updated 08/2026; lists mitochondrial diseases) | BW and 5.1 changed 08/2026; mitochondrial in BW |
| DS-04 | Original-packager label that lags behind other originals in the same group | Lactic acidosis (pre-2026 text; no mitochondrial diseases) | eGFR in 2.3; once daily with evening meal in 2.1; BW lacks 'mitochondrial' |
| DS-05 | Third product group under the same generic name; brand field reads just 'Metformin Hydrochloride' | Lactic acidosis (updated 6/2026) | Description: oral solution; Recent Major Changes: Boxed Warning 6/2026, 5.1 6/2026 |
| DS-06 | Combination product that surfaces in plain 'metformin' searches | Lactic acidosis (updated 8/2026; lists mitochondrial diseases) | 5.1 Lactic Acidosis, 5.2 Pancreatitis, 5.3 Heart Failure, 5.8 Severe and Disabling Arthralgia, 5.9 Bullous Pemphigoid; mitochondrial in BW and 5.1 |
| DS-07 | Second repackager/original mismatch, on a brand product | Lactic acidosis (older text; no mitochondrial diseases) | Same 5.1-5.9 headings as DS-06; 'mitochondrial' absent everywhere |
| DS-08 | Safety-critical, narrow therapeutic index; many interaction questions | Bleeding risk | 5.1 Hemorrhage, 5.3 Calciphylaxis; grapefruit in 7.5; vitamin K in 2.4, 5.9, 7.1; botanicals in 5.1 and 7; cranberry not mentioned |
| DS-09 | Clear listed events (angioedema) and a close-match term (hepatic failure vs hepatotoxicity) | Fetal toxicity | 5.1 Fetal Toxicity, 5.2 Angioedema and Anaphylactoid Reactions, 5.5 Hyperkalemia, 5.6 Hepatic Failure; cough in Adverse Reactions; grapefruit and 'hepatotoxicity' not mentioned |
| DS-10 | Combination product in the older unnumbered format, out of v1 answer scope (D-06) | Fetal toxicity | Fields: warnings, precautions (no warnings_and_cautions); angioedema in warnings |
| DS-11 | Brand among many levothyroxine products and dosage forms; food-interaction questions | Not for obesity or weight loss | Empty stomach in D&A; soybean flour in 2.1 and 7.9; grapefruit juice in 7.9 |
| DS-12 | Same ingredient, different dosage form from DS-11 | Not for obesity or weight loss | Dilution instructions in 2.1; same Boxed Warning theme as DS-11 |
| DS-13 | PV close-match case: event terms differ from label wording | Pulmonary, hepatic and cardiac toxicity | BW mentions liver injury; 5.2 Pulmonary Toxicity, 5.3 Hepatic Injury, 5.5 Visual Impairment, 5.9 Fetal Toxicity; grapefruit in section 7; 'hepatotoxicity' and 'hepatic failure' not mentioned |
| DS-14 | Pharmacogenomic Boxed Warning and a well-known interaction (omeprazole) | Diminished effect in CYP2C19 poor metabolizers | CYP2C19 in BW; omeprazole in 5.1 and 7.2; 5.4 TTP; grapefruit not mentioned |
| DS-15 | Same moiety as DS-16, different salt and release; label-section variation (warning not in boxed field) | None in boxed field (ischemic heart disease warning is in 5.1) | 5.1 Abrupt Cessation of Therapy (ischemic heart disease); crushing in 2.4 |
| DS-16 | Immediate-release counterpart of DS-15 | None in boxed field (ischemic heart disease warning is in 5.1) | 5.1 Abrupt Cessation of Therapy; twice-daily dosing in 2.3 |
| DS-17 | One brand name ('Ozempic') now covers both tablets and an injection | Thyroid C-cell tumors | Indications: 'RYBELSUS and OZEMPIC tablets'; 5.2 Acute Pancreatitis, 5.9 Pulmonary Aspiration During General Anesthesia |
| DS-18 | Only injectable Ozempic label in openFDA, and it is a 2023 repackager copy | Thyroid C-cell tumors | 5.2 Pancreatitis, 5.4 Never Share an OZEMPIC Pen; 'pulmonary aspiration' and 'suicidal' not mentioned |
| DS-19 | OTC Drug Facts format, out of v1 answer scope (D-06); 70 'Tylenol' brand variants in openFDA | None (OTC) | Liver warning and 4,000 mg in Warnings; liver in Ask a doctor; warfarin in Warnings |

## Eval cases

| Category | Cases | IDs |
| --- | --- | --- |
| Ambiguous generic | 5 | LS-01, LS-04, LS-05, LS-13, LS-14 |
| Repackager vs original | 4 | LS-02, LS-03, LS-08, PV-07 |
| Exact product | 2 | LS-06, LS-18 |
| Combination product | 2 | LS-07, LS-09 |
| Brand across routes | 3 | LS-10, LS-11, LS-12 |
| NDC not found | 1 | LS-15 |
| Unsupported format | 2 | LS-16, LS-17 |
| Grounded answer | 8 | GA-01, GA-02, GA-03, GA-04, GA-05, GA-06, GA-07, GA-08 |
| Unsupported claim | 5 | UC-01, UC-02, UC-03, UC-04, UC-05 |
| Refusal | 6 | RF-01, RF-02, RF-03, RF-04, RF-05, RF-06 |
| Historical label | 4 | PV-01, PV-02, PV-06, PV-09 |
| Close match | 2 | PV-03, PV-05 |
| Exact match | 1 | PV-04 |
| Known limitation | 1 | PV-08 |
| Human approval | 1 | PV-10 |
| FAERS context | 1 | PV-11 |

Full cases, with inputs, expected label, expected behaviour, expected evidence, what must not happen, and linked requirements: [`cases-v0.1.csv`](cases-v0.1.csv).

### How a case passes

- **Label:** the answer comes from the expected label, or Label Lens asks when the case expects a question first (GM-07).
- **Evidence:** every claim cites the expected section, and no claim falls outside the retrieved text (GM-01).
- **Must not:** none of the listed failure behaviours occur. Any "must not" in a guardrail-linked case blocks release.
- **PV:** the proposed verdict, the Provisional flag and the human-approval gate all match (GM-06, GM-08).

## Known limitations (tracked, not hidden)

- **Stale-but-only labels aren't flagged.** PV-08: the injectable Ozempic label in openFDA is from 2023, and the provisional rule doesn't catch it, because the label predates the case. Label history (F-08) is the fix. Until then, the label date is always shown.
- **Dosage form isn't a structured field.** Equivalence grouping reads it from label text. When that's unreliable, Label Lens must ask (FR-F01-08).
- **Snapshot data.** Label versions change weekly; the cases pin set IDs and dates as of 2026-11-05.

---

*Source: [openFDA](https://open.fda.gov) drug label API, queried 2026-11-05. Not medical advice; open research prototype.*
