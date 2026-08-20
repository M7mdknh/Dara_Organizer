---
name: dataset-export
description: Project guidance for dataset-export in the Arabic dialect data platform.
---

---
name: dataset-builder-export
description: Use when building filters, training datasets, dataset versions, splits, leakage protection, JSONL/CSV exports, or reproducibility.
---
# Dataset Builder and Export Skill

Dataset builds are reproducible snapshots defined by filters, source records, policies, split strategy, creator, time, and format. Support Gold/Silver, verification, dialect/language, naturalness/commonness, category/intent/situation, pronunciation, conversation availability, source, collection, and training eligibility filters.

Initial exports: JSONL and CSV. Keep export schemas configurable and architecture extensible to Parquet/custom formats.

Protect against leakage. Do not randomly split rows when near-identical/equivalent sentence families, conversation variants, or semantic duplicates could cross train/validation/test boundaries. Group related families before splitting where appropriate and record the strategy.

Exports should include stable IDs and useful provenance/quality fields when requested, while allowing training-specific lean schemas. Dataset versions must be reconstructable later.