---
name: arabic-search-pronunciation
description: Project guidance for arabic-search-pronunciation in the Arabic dialect data platform.
---

---
name: arabic-search-and-pronunciation
description: Use when implementing Arabic normalization, search, pronunciation, RTL UI, or dialect-aware text handling.
---
# Arabic Search and Pronunciation Skill

Arabic/RTL is first-class. Never destructively normalize source orthography.

Maintain original text plus a normalized/search representation. Normalization may address Unicode canonicalization, tatweel, optional diacritics for search, common Alef/hamza forms where appropriate, punctuation/whitespace, and other deterministic search aids. Do not collapse linguistically meaningful differences merely to increase match rate.

Search should combine exact lexical search, normalized lexical search, relational expansion (concepts/synonyms/equivalents), and optional semantic search. Embeddings must supplement, not replace, deterministic Arabic search.

Pronunciation is editable first-class data. Support pronunciation-oriented Arabic/diacritics, optional IPA or machine-readable phonetics, notes, dialect-specific variants, verification, and future native-speaker audio. Automatically suggested pronunciation must remain marked as AI-generated until verified.

Ensure correct RTL layout, mixed Arabic/Latin rendering, cursor/edit behavior, table alignment, copy/paste, and search highlighting.