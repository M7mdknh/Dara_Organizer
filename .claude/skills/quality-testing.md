---
name: quality-testing
description: Project guidance for quality-testing in the Arabic dialect data platform.
---

---
name: quality-and-testing
description: Use before completion and whenever changing critical business logic, imports, permissions, search, review, or exports.
---
# Quality and Testing Skill

Test business behavior, not only component rendering.

Critical coverage: Arabic normalization/search, exact duplicates, semantic conflict routing, idempotent imports, source provenance, permissions, revision/restore, response weighting, equivalent utterance relations, bulk operations, dataset filters, split leakage protection, and export reproducibility.

Before declaring work complete run lint, typecheck, automated tests, database migration checks, seed, and production build. Fix failures. Manually verify the primary workflow: login -> taxonomy edit -> multi-file import -> mapping -> exact match -> conflict review -> synonym/variant approval -> Arabic search -> edit/history -> equivalent utterance -> weighted responses -> conversation -> filters/saved view -> verification/Gold -> dataset build -> JSONL/CSV export.

Never claim functionality is complete if buttons are placeholders, statistics are fabricated, AI is secretly mocked, or required workflows cannot be completed through the UI.