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
| M2 Core answering | 2026-12-10 | In progress: label resolver passes 30 of 30 eval cases |
| M3 Roles and refusals | 2026-12-31 | Not started |
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
- [Demo drug set](docs/demo-drug-set.md): 19 labels chosen for their edge cases, each pinned by NDC, SPL ID and date, with 48 eval cases

### Code

| Path | What it does |
|---|---|
| `packages/ingest` | Normalises openFDA label records: format, dosage form, release type, Recent Major Changes, sections and subsections |
| `packages/core` | The label resolver (exact NDC first, then equivalence groups, then ask) and the PV provisional rule |
| `evals/` | The demo set, eval cases, and the resolver eval runner with its reports |
| `fixtures/` | Label excerpts for the demo set, used by tests and evals |

```bash
npm ci
npm test               # unit tests
npm run eval:resolver  # resolver eval; fails on any wrong label or provisional flag
```

Latest resolver eval: [30 of 30 cases pass](evals/reports/resolver-2026-11-05.md).

### Data

[openFDA](https://open.fda.gov) drug labels and FAERS adverse event reports. v1 covers US prescription labels in the modern numbered (PLR) format.

---

Built by [Tamil Selvan](https://github.com/TamilKaleinz) · Product leader at the intersection of LSHC, compliance and AI.
