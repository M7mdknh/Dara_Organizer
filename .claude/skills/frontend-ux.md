---
name: frontend-ux
description: Project guidance for frontend-ux in the Arabic dialect data platform.
---

---
name: linguistic-frontend-ux
description: Use when building pages, tables, search/filter UI, editing, settings, dashboard, saved views, bulk actions, or RTL user experience.
---
# Linguistic Frontend UX Skill

The frontend is the product. Nontechnical users must complete normal work without backend access.

Primary navigation: Dashboard, Explore, Words & Expressions, Sentences, Conversations, Categories, Dialects, Media & Sources, Review Inbox, Collections, Datasets & Export, Settings.

One database, many views. Provide table/card/detail, concept, sentence explorer, conversation/response explorer, dialect, category, source, and review views without duplicating records.

Prioritize fast universal search, advanced server-side filters, saved views, inline editing, bulk actions, clear provenance/status badges, revision history, and drill-down navigation. Destructive bulk actions require confirmation and should be recoverable where practical.

Desktop-first for data work, responsive for search/review. Excellent Arabic/RTL and mixed-script behavior is mandatory. Avoid generic admin-dashboard aesthetics, dead buttons, unnecessary modals, and giant forms. Use progress states for imports/jobs and virtualization/pagination for large datasets.

Settings must allow admins to manage dialect hierarchy, languages, categories, topics, intents, situations, registers, conversational functions, confidence policies, response behavior, and export defaults from the UI.