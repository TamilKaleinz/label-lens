# What the real labels taught the parser

*2026-11-05 · first run of ingestion against the 19 full demo labels from openFDA*

The first version of the normaliser and section splitter was written and tested against short excerpts of each label. All 40 tests passed. Then we downloaded the full records (2.4 MB, every pinned version still current) and ran the same code over them. It got six things wrong, and none of them were visible in the excerpts.

| Label | What the real text does | What went wrong | Fix |
|---|---|---|---|
| Amiodarone (Dr. Reddy's) | The manufacturer's name contains "Dr." | Read as **DR**, delayed-release | Drop "Dr." before reading release type |
| Tirosint-SOL | "not for inhalation, injection or ophthalmic use" | An oral solution classed as an **injection** | Ignore negated mentions; when the route is known to be oral, text can't make it an injection |
| Lopressor | SPL product data gives the tablet's shape as "CAPSULE" | Tablet and capsule both found, so the form was unknown and the group uncertain | Ignore the shape code after an imprint |
| Synthroid, metformin (repackager) | Headings written "5. 2 Cardiac…" | Subsections 5.2 to 5.4 missing, merged into 5.1 | Allow a space after the dot |
| Lisinopril | "7.7 mTOR Inhibitors" starts lowercase; "8.6 Race ACE…" is followed by an acronym | Two subsections merged into their neighbours | A heading is a number followed by any word |
| Lisinopril, metoprolol | "initial dose is 2.5 mg", "doses from 12.5 to 200 mg" | Doses read as section numbers, and a real heading was then skipped | A number followed by a unit or a range is never a heading |
| Ozempic | openFDA repeats each subsection as its own array entry after the full section | Every Warnings and Precautions subsection appeared twice | Drop array entries already contained in the text |

**Why this matters for Label Lens.** Each bug would have produced a wrong citation, not a crash. Delayed-release amiodarone would have grouped with the wrong products. A missing 5.2 would have cited "5.1" for a cardiac warning. A dose read as "2.5" would have split the dosing section at the wrong place, so an answer about renal dosing could quote the wrong paragraph. These are exactly the failures guardrail GM-07 (wrong label) and the claim checker exist to stop. Catching them at ingestion is cheaper.

**What changed in the process.**

- Every fix has a small unit test named after the label pattern it handles.
- Each full label now has a golden snapshot (format, dosage form, release, Recent Major Changes, every section and subsection code). The golden tests fail if any of it changes. Undoing the "Dr." fix fails both its unit test and the amiodarone golden file.
- A nightly job re-downloads the labels and re-runs everything, so a new label version shows up as a failing check rather than a silent change.
- Remaining gaps in the section numbering were checked by hand. All are real: modern labels skip 8.3 (formerly Nursing Mothers), and many skip 12.2 or 12.4.

**Lesson.** Test fixtures written by hand encode what you already expect. The real data is where the edge cases live, so ingestion is tested against full records from the first day they're reachable.
