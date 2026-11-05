# Data check: openFDA drug labels and FAERS

The openFDA label API is usable for Label Lens, but only with three scoping decisions. Real labels are messier than the PRD assumed: there are hundreds of near-duplicate labels per drug, two different label formats, and only the current version of each label.

## What we checked

All queries were run against the live API (`api.fda.gov`) on 2026-11-05. Label data was last updated 2026-11-05 and FAERS data 2026-10-28.

| # | Question | Query (abridged) | Result |
|---|---|---|---|
| 1 | How many labels match one generic name? | `generic_name:metformin` | **350** labels. The top hit was a sitagliptin + metformin combination, not metformin alone |
| 2 | How many with an exact generic match? | `generic_name.exact:"METFORMIN HYDROCHLORIDE"` | **234** labels from **69** manufacturers |
| 3 | Who are those manufacturers? | count by `manufacturer_name` | Top three are repackagers: A-S Medication Solutions (41), Bryant Ranch Prepack (28), Aphena Pharma Solutions (22) |
| 4 | Does filtering to original packagers help? | `+ is_original_packager:true` | Down to **49** labels from **39** manufacturers |
| 5 | Is the original brand available? | `brand_name.exact:"GLUCOPHAGE"` | **Not found.** The reference brand is no longer in the dataset |
| 6 | Are past label versions available? | `set_id:<one label>` | **1** result: only the current version (v6) |
| 7 | How many Rx labels use the modern numbered format (PLR)? | `_exists_:warnings_and_cautions` | **19,602** |
| 8 | How many Rx labels use the older unnumbered format? | `_exists_:warnings AND _missing_:warnings_and_cautions` | **12,754** (about 39% of Rx labels) |
| 9 | How ambiguous are brand names? | count `brand_name` for "tylenol" | **70** brand variants (Extra Strength, Children's, PM, Sinus Severe…) |
| 10 | Can we cite subsections? | Inspect a PLR metformin label | **Yes.** Subsection numbers are in the text (5.1 Lactic Acidosis, 5.2 Vitamin B12…) |
| 11 | FAERS volume for a known listed event | metformin + "lactic acidosis" | **19,902** reports |

## What it means for the product

1. **Disambiguation is the hardest part of F-01, not a side case.** A search for one drug returns hundreds of labels, mostly repackagers selling the same product. Default to original packagers, group labels whose text is identical, and show the newest first.
2. **Rx labels come in two formats.** About 39% use the older format, with sections like "Warnings" and "Precautions" and no numbering. Section-number citations (FR-F03-02) only work cleanly on modern labels.
3. **OTC labels use a third format (Drug Facts).** "Tylenol" alone returns 70 variants, with fields like "Do not use" and "Ask a doctor". It needs its own parser and its own refusal rules.
4. **Version diff (F-06) can't come from openFDA.** It stores only the current version of each label, so it needs DailyMed's label history. DEP-03 is confirmed.
5. **Subsection citations are possible.** Numbers like 5.1 appear in the text, so citations can point to the subsection, not just the section.
6. **FAERS numbers are large and easy to misread.** 19,902 reports for a well-known listed reaction shows why GM-05 ("reports, not incidence") matters.
7. **To verify next:** some section fields appear to start with the label's Highlights summary before the full text. The parser must separate the two.

## Decisions proposed for the PRD

| ID | Decision | Why |
|---|---|---|
| D-06 | v1 covers **prescription labels in the modern numbered (PLR) format only** | Reliable section citations; older-format and OTC labels move to later releases |
| D-07 | Search **defaults to original packagers**, groups identical label text, and sorts newest first | Cuts 234 metformin labels to a short, meaningful choice |
| D-08 | F-06 Label version diff will use **DailyMed** label history | openFDA keeps only the current version |

## Not yet checked

- Rate-limit headers (couldn't read them from the browser). Get a free API key before building.
- How often the Highlights text is merged into section fields.

---

*Source: [openFDA](https://open.fda.gov). openFDA's own disclaimer: "Do not rely on openFDA to make decisions regarding medical care… you should assume all results are unvalidated."*
