---
name: conversation-modeling
description: Project guidance for conversation-modeling in the Arabic dialect data platform.
---

---
name: conversation-modeling
description: Use when working on sentences, equivalent utterances, common responses, response weights, intents, conversational functions, or multi-turn dialogue.
---
# Conversation Modeling Skill

Optimize for natural spoken behavior, not dictionary lookup.

Represent equivalent utterances as natural ways to express the same communicative meaning. Literal translation is optional metadata, not the primary alignment.

Represent conversational behavior as semantic trigger/intent -> trigger variants -> response family -> response variants. Example ASK_WELLBEING may include كيف حالك؟, كيف الحال؟, علومك؟ and multiple appropriate responses.

Response variants support editable weights. Do not use uniform randomness by default. Keep human-estimated commonness separate from observed corpus frequency; corpus frequency may only be displayed when computed from real corpus evidence.

Support multi-turn conversations with ordered turns, speaker labels, dialect/language, intent/function, source, verification, and future timestamps/audio. Capture fillers, discourse markers, acknowledgments, interruptions, praise/replies, thanks/replies, apologies/replies, requests, refusals, humor, hospitality, and other voice-chat functions.

Retain useful rejected alternatives with reasons such as unnatural, too formal, MSA-like, wrong dialect/context, outdated, or incorrect. These may later become preference/evaluation data.