---
name: import-review
description: Project guidance for import-review in the Arabic dialect data platform.
---

---
name: import-and-review
description: Use when implementing file ingestion, normalization, duplicate matching, conflict handling, bulk review, or review inbox behavior.
---
# Import and Review Skill

Support XLSX, CSV, TXT, paste, manual entry, multiple files per import, and imports at different times. Every import creates a Source/ImportJob with uploader, timestamps, mappings, counts, errors, and derived-record traceability.

Pipeline: inspect -> preview -> map columns -> attach dialect/language/source metadata -> normalize non-destructively -> deterministic matching -> semantic candidate matching -> enrichment -> review routing -> summary.

Rules:
- Exact text + compatible semantic/dialect context: idempotently match existing record.
- Harmless Unicode/punctuation/diacritic normalization: consolidate only when deterministic; preserve source form.
- Semantic overlap or competing expressions for the same concept: never silently merge. Create a ReviewItem.
- Human-vs-AI disagreement, dialect disagreement, destructive replacement: always review.
- Successful exact matches should not clutter the reviewer queue.

Review actions should include approve, add synonym, add variant, dialect equivalent, different meaning, different dialect, replace, edit, reject. Support keyboard shortcuts and safe bulk operations. Never make LLM self-reported confidence the sole auto-approval criterion.