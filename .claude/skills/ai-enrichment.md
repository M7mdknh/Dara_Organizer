---
name: ai-enrichment
description: Project guidance for ai-enrichment in the Arabic dialect data platform.
---

---
name: ai-enrichment
description: Use when adding translation, classification, semantic matching, AI suggestions, confidence policies, or provider integrations.
---
# AI Enrichment Skill

AI is an assistant around human dialect knowledge, not the source of truth.

Use provider-independent adapters. Store provider/model/version/time and relevant provenance for generated assertions. Initial enrichment targets: MSA, English, French, Spanish; meaning extraction; concept matching; categories/topics/intents/situations/register; dialect suggestions; related expressions; response candidates; pronunciation suggestions; QC.

Never overwrite human-curated data. AI outputs are candidates or Silver until policy/human verification promotes them.

Do not fabricate confidence. LLM self-reported percentages are not calibrated probabilities. Auto-processing should rely on deterministic rules or empirically validated policies. Semantic conflicts and human-vs-AI/dialect disagreements always route to review.

If no provider key exists, core workflows must still function. A development mock may exist only when clearly labeled as mock and must never masquerade as real linguistic output.