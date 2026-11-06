# Label Lens

**Ask a drug label a question. Get a cited answer, or an honest refusal.**

Label Lens answers questions about an FDA drug label, adjusted to the role of the person asking: pharmacist, medical information, pharmacovigilance, and later patients and regulatory teams. Every claim links to the exact label section it came from. When the label can't answer, or the question asks for personal medical advice, Label Lens says so clearly, shows what the label does say, and points to the right person to ask.

> **Open research prototype.** Uses public FDA data only. Not medical advice, not a medical device, and not for clinical use. Always confirm with the official label or a qualified professional.

---

### Status

`Building` · Milestone M2 · v1 target: mid-January 2027

| Milestone | Target | Status |
|---|---|---|
| M1 Discovery complete | 2026-11-19 | Done: [data check](docs/data-check-2026-11-05.md), [demo set](docs/demo-drug-set.md), [architecture](docs/architecture.md) |
| M2 Core answering | 2026-12-10 | Live on OpenAI: 99% of answerable questions answered with a cited expected section, 0 ungrounded claims shown ([first live run](docs/live-eval-2026-11-06.md)) |
| M3 Roles and refusals | 2026-12-31 | In progress: safety classifier and refusals live, all blocking guardrails pass ([write-up](docs/refusals-2026-11-06.md)); PV listedness next |
| M4 First full eval run | 2027-01-10 | Not started |
| M5 v1 public launch | 2027-01-15 | Not started |

### How it's built to be trusted

- **Design the "no" first.** Four refusal patterns (personal advice, label silent, out of scope, low confidence), each of which still gives the closest useful evidence.
- **Make the evidence visible.** Answers come only from the label, and every claim links to its section and quoted text.
- **A role is a lens, not a permission.** Roles change vocabulary, depth and format, never the safety rules.
- **If you can't test it, you can't ship it.** Every requirement traces to edge cases and test cases, and guardrail evals block any release that fails.

### Documents

- [Product Requirements Document](docs/PRD.md): intended use, roles, feature specs with requirement-to-test traceability, metrics, release plan and decision log
- [Solution architecture](docs/architecture.md): how the requirements led to the design, plus the high-level design, low-level design and deployment
- [Data check, 2026-11-05](docs/data-check-2026-11-05.md): what the openFDA data actually looks like, and the scoping decisions it forced
- [The safety classifier and refusals](docs/refusals-2026-11-06.md): a grounded answer can still be the wrong answer; 0 personal-advice answers across 40 questions in 3 roles
- [First live run: what the real model did](docs/live-eval-2026-11-06.md): the guardrail held from the first call; three fixes took answers from 92% to 99%
- [What the real labels taught the parser](docs/ingestion-findings-2026-11-05.md): six bugs the excerpts hid, and how golden files now catch them
- [Demo drug set](docs/demo-drug-set.md): 19 labels chosen for their edge cases, each pinned by NDC, SPL ID and date, with 48 eval cases

### Code

| Path | What it does |
|---|---|
| `packages/ingest` | Normalises openFDA label records: format, dosage form, release type, Recent Major Changes, sections and subsections |
| `packages/core` | The answer pipeline: label resolver (exact NDC first, then equivalence groups, then ask), label-scoped retriever, generator, claim checker (quote check, then support check), and the PV provisional rule. Models sit behind one interface: OpenAI in production, deterministic mocks in tests |
| `config/` | Model choices, prompts, role styles and retrieval settings, hashed into one `config_hash` that every response and eval report carries |
| `evals/` | The demo set, eval cases, and the resolver eval runner with its reports |
| `fixtures/` | Label excerpts for the resolver evals, and the full openFDA records for the golden-file tests (`fixtures/full/`) |

```bash
npm ci
npm test               # unit, golden-file, pipeline and safety tests (134)
npm run eval           # all evals; any failure fails the run
npm run eval:resolver  #   label resolution and the provisional rule (GM-07, GM-08)
npm run eval:retrieval #   the right sections rank in the top 5, on full labels
npm run eval:claims    #   the quote check keeps faithful claims and drops the rest (GM-01)
npm run eval:pipeline  #   end to end on a mock model, with injected bad claims that must be dropped
npm run eval:refusals  #   emergencies, personal advice, out of scope, in every role (rules offline)
npm run eval:refusals:live  # the same, with the real classifier (costs money)
npm run eval:live      # against the real OpenAI models (needs OPENAI_API_KEY in .env; costs money)
npm run check:openai   # confirm the key works and list available models
npm run ingest:fetch   # re-download the pinned labels from openFDA; exits 2 on label drift
npm run golden:update  # regenerate golden snapshots after a reviewed label change
```

Latest evals: [resolver 30 of 30](evals/reports/resolver-2026-11-05.md) · [retrieval 28 of 28](evals/reports/retrieval-2026-11-05.md) · [claim checker 15 of 15](evals/reports/claims-2026-11-05.md) · [pipeline 112 of 112, 84 of 84 injected bad claims dropped](evals/reports/pipeline-2026-11-05.md).

Every part of the retriever and claim checker was removed once on purpose to confirm an eval fails without it. One part (counting section titles twice) changed no result, so it was taken out.

### Data

[openFDA](https://open.fda.gov) drug labels and FAERS adverse event reports. v1 covers US prescription labels in the modern numbered (PLR) format.

---

Built by [Tamil Selvan](https://github.com/TamilKaleinz) · Product leader at the intersection of LSHC, compliance and AI.
