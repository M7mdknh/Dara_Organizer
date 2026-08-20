---
name: data-model
description: Project guidance for data-model in the Arabic dialect data platform.
---

---
name: dialect-data-model
description: Use when changing concepts, expressions, sentences, dialect hierarchy, provenance, revisions, quality tiers, or training eligibility.
---
# Dialect Data Model Skill

Treat Concept/Meaning as the semantic anchor. Expressions are realizations linked by typed relations such as synonym, near-synonym, dialect-equivalent, translation, regional/spelling/pronunciation variant, formal/informal/slang equivalent, related expression, and common response.

Preserve original text and store normalized/search text separately. Allow an expression to participate in multiple senses when required. Dialect taxonomy is a user-editable tree, and records may belong at an appropriate parent/common node rather than being duplicated into every child dialect.

Sentences/utterances store natural realizations and link to concepts/expressions. Equivalent utterance groups represent the same communicative meaning across dialects/languages; do not assume word-for-word alignment.

Every important record or field-level assertion should be attributable to a source and carry verification/provenance metadata. Keep Gold, Silver, and Reference/Candidate distinct. Keep training eligibility independent of quality tier.

All meaningful edits must be auditable and reversible. Prefer append/revision semantics over destructive replacement. Use transactions and constraints to maintain relationship integrity.