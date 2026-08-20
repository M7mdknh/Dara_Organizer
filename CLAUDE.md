# Arabic Dialect Data Platform

## Mission
Build and maintain a production-quality linguistic data platform for creating training data for fluent Arabic voice chat (STT -> LLM -> TTS). Prioritize natural spoken dialect, sentences, equivalent utterances, conversational behavior, pronunciation, provenance, and safe human review. RAG/domain knowledge is out of scope for now.

## Non-negotiable product rules
1. The frontend is the product. Normal linguistic operations must never require SQL, JSON editing, terminal work, or backend changes.
2. Concepts/meanings are semantic anchors; do not reduce the model to spreadsheet rows.
3. Preserve original imported text. Normalization/search forms are separate fields.
4. Human dialect data outranks AI suggestions. AI never silently overwrites human data.
5. Exact deterministic duplicates may auto-match. Semantic overlap, human-vs-AI disagreement, dialect disagreement, and destructive changes require review.
6. Multiple expressions, synonyms, variants, and weighted responses are valid.
7. Equivalent utterances are preferred over literal translations.
8. Sentences and conversations are more important than isolated vocabulary.
9. Pronunciation is first-class and editable.
10. Every important datum has provenance, verification state, revision history, quality tier, and training eligibility.
11. Never fabricate confidence, naturalness, commonness, or corpus frequency.
12. Arabic/RTL is first-class.
13. Dialects, languages, categories, topics, intents, situations, registers, and conversational functions must be configurable from the UI.
14. Build for large cumulative imports and eventual millions of records.
15. Do not fake functionality or ship dead buttons.

## Domain model
Core entities should include: Concept, Expression, ExpressionRelation, Pronunciation, Sentence/Utterance, EquivalentUtteranceGroup, ConversationalPattern, ResponseVariant, Conversation, ConversationTurn, DialectNode, Language, Topic, Intent, Situation, Register, ConversationalFunction, Source, ImportJob, ReviewItem, Collection, Revision, Annotation/Verification, DatasetBuild, DatasetVersion, SavedView, User/Role, and future MediaAsset/MediaSegment.

Dialect taxonomy is hierarchical and editable. Initial useful nodes include Common Arabic, MSA, Saudi/Common Saudi/Najdi/Hijazi/Jeddawi/Makkawi/Madani/Eastern, Gulf, Levantine/Syrian, Egyptian, Iraqi, and Maghrebi, but never hard-code taxonomy assumptions into business logic.

## Initial enrichment languages
MSA, English, French, Spanish. Make languages configurable.

## Conversational behavior
Model semantic trigger/intent -> trigger variants -> response family -> weighted response variants. Keep human-estimated commonness separate from observed corpus frequency. Support multi-turn conversations and negative/rejected alternatives.

## Imports
Support XLSX, CSV, TXT, paste, manual entry, one or many files, now or later. Use a visual mapping wizard. Imports are cumulative and always matched against existing data. Successful exact matches should not burden reviewers. Conflicts go to Review Inbox.

## Search and views
One database, many views: Dashboard, Explore, Words & Expressions, Sentences, Conversations, Categories, Dialects, Media & Sources, Review Inbox, Collections, Datasets & Export, Settings. Universal search must connect concepts, expressions, synonyms, utterances, responses, conversations, pronunciation, classifications, and sources. Provide advanced filters and saved views.

## Quality tiers
Gold = human-collected/verified high-quality data. Silver = AI-enriched/automatically aligned data meeting policy. Reference/Candidate = useful but not accepted as training truth.

## Architecture defaults
Prefer a maintainable TypeScript web stack: Next.js + React + PostgreSQL + strongly typed ORM + Tailwind + accessible component library. Use background jobs for imports/enrichment, object-storage abstraction for future media, and provider-independent AI adapters. Avoid unnecessary microservices.

## Engineering standards
- Strong typing; validate boundaries.
- Domain logic belongs in services/modules, not React components.
- Use transactions for multi-record linguistic operations.
- Add database constraints and indexes deliberately.
- Server-side filtering/pagination for large tables.
- Preserve auditability and idempotency for imports/jobs.
- Protect secrets and enforce authorization server-side.
- Add meaningful tests for normalization, duplicates, conflicts, imports, permissions, revision history, response weighting, Arabic search, and dataset splitting/leakage.
- Keep files focused; avoid giant components/services.

## Working method
Before substantial changes: inspect repo, schema, migrations, tests, and related domain code. State a concise plan, then implement; do not stop at planning. Build complete vertical workflows instead of empty pages. Run lint, typecheck, tests, and production build before declaring completion. Fix failures rather than documenting them away.

## Definition of done
A nontechnical user can import multiple files, map columns, resolve semantic conflicts, edit data, search Arabic deeply, manage synonyms/pronunciation/equivalent utterances, create weighted common responses and conversations, manage taxonomies, verify/reject records, inspect history/provenance, create saved views, build versioned training datasets, and export JSONL/CSV without backend access.