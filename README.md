# Arabic Dialect Data Platform

Linguistic data infrastructure for building training data for fluent Arabic
dialect voice chat (STT → Dialect Understanding → LLM → Dialect Realization →
TTS). This application is **not** the voice runtime — it is the production
data platform used to collect, organize, semantically match, enrich, review,
search, version, and export the corpus that trains and evaluates that
runtime.

See `CLAUDE.md` and `.claude/skills/*.md` for the full product/domain
specification this app implements.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **PostgreSQL 17 + pgvector** via **Prisma 7** (driver adapter: `@prisma/adapter-pg`)
- **Redis + BullMQ** for durable background jobs; a dedicated worker process
  shares domain services with the app
- **S3-compatible object storage** (AWS S3, R2, Spaces, MinIO) for immutable
  original uploads and dataset exports
- **OpenAI** (Responses API + Embeddings) and **Anthropic** behind one
  provider-independent AI adapter; a labeled mock provider for dev/tests
- **Tailwind CSS 4**, hand-built accessible components (no generic
  admin-dashboard UI kit)
- **iron-session** for cookie sessions, **bcryptjs** for password hashing
- **Docker / docker-compose** for local full-stack dev and production images
- **Vitest** for unit tests

## Local development

### Option A — Docker Compose (full stack, closest to production)

```bash
docker compose up -d --build
# first time only (or after a schema change):
DATABASE_URL="postgresql://dialect:dialect_dev_password@localhost:5433/dialect_platform" npx prisma migrate deploy
DATABASE_URL="postgresql://dialect:dialect_dev_password@localhost:5433/dialect_platform" npx tsx prisma/seed.ts
```

This starts `app` (:3000), `worker`, `postgres` (pgvector, :5433), `redis`
(:6380), and `minio` (:9000, console :9001, credentials
`dialect_minio` / `dialect_minio_secret`). Migrations are deliberately run
from the host/CI, not the slim runtime image — see "Production" below.

### Option B — Node directly, infra in Docker

```bash
docker run -d --name dialect-db -e POSTGRES_USER=dialect -e POSTGRES_PASSWORD=dialect_dev_password \
  -e POSTGRES_DB=dialect_platform -p 5433:5432 pgvector/pgvector:pg17
cp .env.example .env   # then edit — see variable reference below
npm install
npm run db:migrate     # prisma migrate dev
npm run db:seed
npm run dev             # app on :3000
```

Redis, object storage, and background jobs are optional in this mode —
`BACKGROUND_JOBS_ENABLED=false` (the default) makes imports/enrichment run
inline in the request instead. To exercise the real worker, also run:

```bash
docker run -d --name dialect-redis -p 6380:6379 redis:7-alpine
docker run -d --name dialect-minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=dialect_minio -e MINIO_ROOT_PASSWORD=dialect_minio_secret \
  minio/minio server /data --console-address ":9001"
# set BACKGROUND_JOBS_ENABLED=true, REDIS_URL, STORAGE_PROVIDER=s3 + S3_* in .env
npm run worker
```

Demo accounts (seeded, password `password123` for all):
`admin@example.com` (Admin), `editor@example.com` (Editor),
`reviewer@example.com` (Reviewer), `viewer@example.com` (Viewer).

Sample import files: `sample-imports/sample_expressions.csv`,
`sample-imports/sample_sentences.csv`.

### Verify

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
docker build --target runner -t dialect-app .
docker build --target worker -t dialect-worker .
```

## Production

Required external services — **all must be managed/hosted, not
containers you run yourself on the app host**:

| Service | Why |
|---|---|
| PostgreSQL 17+ with the `vector` extension available (e.g. RDS/Cloud SQL with pgvector, or a `pgvector/pgvector`-based host) | Primary datastore + embeddings |
| Redis | Durable job queue (BullMQ) |
| S3-compatible object storage | Immutable import/export files |
| OpenAI API key (or Anthropic) | Enrichment + semantic matching — optional; `AI_PROVIDER=none` disables it |

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

`docker-compose.prod.yml` only runs the `app` and `worker` containers —
Postgres/Redis/MinIO are deliberately absent from it; point `DATABASE_URL`,
`REDIS_URL`, and `S3_*` at your managed services. Run migrations as a
release step before rolling out new app/worker versions:

```bash
DATABASE_URL=<production-url> npx prisma migrate deploy
```

Scale the worker horizontally by increasing `docker-compose.prod.yml`'s
`worker.deploy.replicas` (or your orchestrator's equivalent) — BullMQ
workers coordinate safely over Redis; no additional configuration is
needed.

### Database backups

This app does not implement backups itself — for production PostgreSQL:

- Use your managed provider's automated backups (RDS/Cloud SQL/etc.) with
  point-in-time recovery enabled.
- Enable versioning on the S3 bucket used for `STORAGE_PROVIDER=s3` so
  accidental overwrites/deletes of import/export objects are recoverable
  (the app never overwrites an existing object key by design, but bucket
  versioning is cheap insurance).
- Periodically test a real restore — an untested backup is not a backup.
- Do not treat the live database as its own backup.

## Environment variables

See `.env.example` for the full annotated list (sections: application,
database, AI provider, semantic matching, Redis/background jobs, object
storage, uploads, dataset export, logging). Validated at process startup by
`src/lib/env.ts` via `instrumentation.ts` — the app/worker fail immediately
with a clear message if required production config is missing, rather than
failing confusingly on first use.

Notable variables:

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | ≥32-char secret for signed session cookies |
| `AI_PROVIDER` | `none` \| `anthropic` \| `openai` \| `mock` |
| `OPENAI_MODEL` / `OPENAI_ADJUDICATION_MODEL` | Primary reasoning model vs. escalation-only model for hard semantic cases |
| `OPENAI_EMBEDDING_MODEL` / `OPENAI_EMBEDDING_DIMENSIONS` | Must match the `Embedding.vector` column width in `prisma/schema.prisma` if changed |
| `SEMANTIC_MATCHING_ENABLED` | Turns on the pgvector+LLM candidate-matching stage during import (default `false`) |
| `SEMANTIC_VECTOR_MIN_SIMILARITY` / `SEMANTIC_TOP_K` | Retrieval tuning — thresholds, not proof of equivalence |
| `SEMANTIC_AUTO_APPROVE` | Always `false` in this codebase's actual logic path — kept as an explicit config flag per spec, but semantic conflicts always route to review regardless |
| `BACKGROUND_JOBS_ENABLED` / `REDIS_URL` | Enables the durable queue; when off, everything falls back to running inline |
| `STORAGE_PROVIDER` / `S3_*` | Object storage; `local` is a dev-only non-durable fallback |

## Architecture

```
src/
├── app/
│   ├── (app)/            # authenticated views
│   ├── api/               # REST route handlers — auth/validate, delegate to domains/services
│   └── login/
├── components/
├── domains/                # business logic: expressions, sentences, dialects, taxonomy,
│                             #   imports, review, datasets
├── services/
│   ├── ai/                  # provider.ts (Anthropic/OpenAI/mock), enrichment.ts,
│   │                         #   embeddings.ts (lifecycle), embedTrigger.ts
│   ├── matching.ts           # deterministic exact/normalized/concept matching
│   ├── matching/semantic.ts   # pgvector retrieval + LLM judgment cascade
│   ├── storage.ts              # S3-compatible object storage abstraction
│   └── normalization.ts, revisions.ts, dialectTree.ts
├── lib/                     # db, env (typed config), redis, queue, logger, session, api helpers
├── worker/
│   ├── index.ts              # worker process entrypoint — registers all processors
│   └── processors/            # one per job type, calling into src/domains + src/services
prisma/
├── schema.prisma            # full domain model incl. Embedding (pgvector)
└── seed.ts
Dockerfile                   # multi-stage: deps / builder / runner (app) / worker
docker-compose.yml            # local full stack
docker-compose.prod.yml       # app + worker only; external managed services
instrumentation.ts            # validates env at process startup
```

App and worker **share domain services** — a processor in
`src/worker/processors/` calls the exact same function
(`processImportJob`, `runEnrichment`, `ensureEmbedding`, ...) that the
synchronous request-handler fallback calls. Linguistic business logic is
never duplicated between the two.

## Data model summary

Concept (semantic anchor) → Expression (typed `ExpressionRelation`s:
synonym, dialect-equivalent, translation, variant, etc.) → Pronunciation.
Sentence → UtteranceGroup (equivalent-meaning realizations across
dialects/languages) → Pronunciation. ResponsePattern → weighted
ResponseTrigger/Variant. Conversation → ordered ConversationTurn. Dialects
and Categories are user-editable trees. Every important record carries
quality tier, verification status, training eligibility, origin, and
provenance. All meaningful edits are captured in an append-only `Revision`
log with restore support. `Embedding` (new) is a polymorphic table
(`entityType`/`entityId` → `CONCEPT`/`SENTENCE`/`EXPRESSION`) holding the
pgvector column, source representation + hash, and staleness flag —
decoupled from any single embedding provider/model by design.

## Semantic matching pipeline

```
new datum → preserve original → normalize
  → deterministic exact/normalized match (src/services/matching.ts)
  → [if unresolved AND SEMANTIC_MATCHING_ENABLED]
      embed (OpenAI, or mock in dev/tests) → pgvector top-K candidate
      concepts (src/services/ai/embeddings.ts retrieveCandidates)
      → LLM judgment against that small candidate set, weighting sentence
        context over an isolated word when available
        (src/services/matching/semantic.ts judgeExpressionAgainstConcepts)
      → SAME/RELATED  → escalate to OPENAI_ADJUDICATION_MODEL only if
        UNCERTAIN and SEMANTIC_ADJUDICATION_ENABLED
  → quality policy: deterministic-safe → process; anything semantic,
    uncertain, or conflicting → Review Inbox with full evidence (candidate
    concepts, vector similarity, model decision + reason, escalation
    provenance) — never auto-approved from similarity alone
```

The expensive stages (embedding, LLM judgment, adjudication) only run when
deterministic matching could not resolve the item, and the LLM is always
shown a small retrieved candidate set — never the whole corpus. Reviewers
resolve semantic-candidate items in `/review` with a dedicated card showing
ranked candidates, similarity scores, and the model's reasoning; "Link to
this concept" is the only path that actually attaches an AI suggestion to
data, and it is always a human click.

Confidence is never a fabricated LLM percentage. Stored evidence is
qualitative/structural: `deterministic_match` outcome, `vector_similarity`
(a retrieval score), `candidate_rank`, `model_decision`
(SAME/RELATED/DIFFERENT/UNCERTAIN), `model_reason`, `context_available`,
`escalated`, `human_verified`. Thresholds (`SEMANTIC_VECTOR_MIN_SIMILARITY`,
`SEMANTIC_TOP_K`) are configuration, not hard-coded, so they can be
recalibrated from real validation data later.

## pgvector

`Embedding` (`prisma/schema.prisma`) stores one row per embedded
Concept/Sentence(/Expression), each with `provider`, `model`, `dimensions`,
`sourceText`, `sourceHash`, the `vector` column (`Unsupported("vector(3072)")`
— Prisma has no native vector type, so all reads/writes/similarity queries
go through `$queryRaw`/`$executeRaw`), `stale`, and `generatedAt`.

**Dimension note:** pgvector's HNSW/IVFFlat index types cap at 2000
dimensions, but `text-embedding-3-large` (the configured default) produces
3072-dim vectors. No ANN index is created; candidate retrieval uses exact
KNN (`ORDER BY vector <=> $1 LIMIT k`), which is correct and fast enough at
V1 corpus scale. To add an ANN index later, either configure OpenAI's
embedding `dimensions` truncation to ≤2000 or move to a dedicated vector
service — see the comment in
`prisma/migrations/20260820180000_pgvector_and_production_infra/migration.sql`.

**Lifecycle** (`src/services/ai/embeddings.ts`): creating/updating a
Concept or Sentence builds a deterministic textual representation (concept:
gloss + every linked expression grouped by dialect/language, not just the
id; sentence: the utterance + dialect + meaning + intent), hashes it, and
only calls the embedding provider when the hash differs from what's
stored — an unrelated field edit never burns an API call. `stale` is set
when no provider is configured at generation time. Settings → AI &
Confidence exposes coverage (embedded/total per entity type, stale count)
and "Backfill missing" actions (`/api/embeddings/status`,
`/api/embeddings/backfill`, admin-only).

## Background jobs

Redis + BullMQ (`src/lib/queue.ts`), six job types: `IMPORT_PARSE`,
`IMPORT_MATCH`, `GENERATE_EMBEDDINGS`, `AI_ENRICH`,
`SEMANTIC_ADJUDICATION`, `DATASET_EXPORT`. `enqueueOrRun()` queues when
`BACKGROUND_JOBS_ENABLED=true` and Redis is reachable, otherwise runs the
same function inline — callers never need an `if` for this.

**Resumability/idempotency** (`processImportJob` in
`src/domains/imports/service.ts`): each `ImportRow` gets a `processedAt`
timestamp the moment it's durably resolved; on any restart, rows that
already have it are skipped entirely rather than reprocessed. Outcome
counters (`accepted`/`matched`/`conflicts`/...) are **recomputed from
actual row statuses** on resume rather than trusted from the last periodic
checkpoint (`processedRows` etc. are only checkpointed every
`IMPORT_CHUNK_SIZE` rows) — this was a real bug caught during testing (see
"Verification performed" below) where a hard kill between checkpoints
silently dropped rows from the final totals even though they were
correctly skipped from reprocessing.

Retries: `attempts: 3` with exponential backoff (`src/lib/queue.ts`
`DEFAULT_JOB_OPTIONS`); BullMQ's stalled-job detection automatically
requeues a job whose worker died mid-processing.

## Object storage

`src/services/storage.ts` wraps `@aws-sdk/client-s3` (works with AWS S3,
Cloudflare R2, DigitalOcean Spaces, MinIO — nothing AWS-specific). Uploaded
source files are stored under `imports/<sourceId>/original.<ext>` and never
overwritten; `Source.checksum`/`fileSize`/`mimeType`/`objectKey` are
recorded, and a checksum match on re-upload is surfaced to the user as
`duplicateOfSourceId` (not auto-blocked — that decision is left to the
user). Dataset exports are persisted under
`exports/<datasetId>/<exportId>[_<split>].<format>` alongside the
streamed-to-browser download, so every export remains reproducible/
re-downloadable, not just a one-time stream. `STORAGE_PROVIDER=local` is a
dev-only fallback that skips durable persistence entirely — never used in
production (enforced by env validation).

## Docker

`Dockerfile` is a four-stage build: `deps` (npm ci, cached) → `builder`
(`next build` with `output: "standalone"`) → `runner` (minimal production
app image, non-root user, `HEALTHCHECK` against `/api/health`) → `worker`
(runs `tsx src/worker/index.ts` directly against the full `node_modules`,
sharing the exact same domain code as the app). `docker-compose.yml` runs
the full local stack with healthchecks and dependency ordering (`minio-init`
creates the bucket before `app`/`worker` start).

## Health & observability

`GET /api/health` checks database, Redis (if configured), and object
storage (if configured) without leaking secrets, returning 200/503. The
worker logs structured single-line JSON (`src/lib/logger.ts`) for every job
(`queue`, `jobId`, `attempt`, `durationMs`, outcome) plus a 60s heartbeat;
never logs API keys or credentials. `EnrichmentJob` records
`promptTokens`/`completionTokens`/`totalTokens` when the provider reports
them (never fabricated) for future cost analysis.

## Tests

```bash
npm test
```

56 tests across 8 files: Arabic normalization (incl. a real diacritics-regex
regression), deterministic matching semantics, dataset split leakage
protection/reproducibility, revision diffing, environment-schema validation
(`src/lib/env.test.ts` — every production guardrail), object-storage key
builders and checksum determinism, the AI provider abstraction (mock
provider only — **no automated test makes a real network call**), and the
background-job inline-fallback contract.

**Not in the automated suite, verified manually against a real running
stack instead** (see "Verification performed" in the delivery notes): pgvector
candidate retrieval, embedding generation end-to-end, import
resume-after-hard-kill at real scale (15,000 rows), Docker Compose startup,
and cross-container health checks. This mirrors the original project's
test philosophy (pure-function unit tests; no live-database integration
suite) rather than silently changing it.

## Known limitations / next phase

- No automated browser/E2E pass — no browser automation tool was available.
  Verification relied on API-level tests, HTTP smoke tests, and hands-on
  Docker Compose exercises (including two genuine SIGKILL-mid-import
  recovery tests). Manually click through the primary workflow before
  shipping.
- The OpenAI Responses API request/response shape in
  `src/services/ai/provider.ts` was implemented from documented behavior
  but never called against a live OpenAI key in this environment (none was
  available) — review it against current API docs before first production
  use with `AI_PROVIDER=openai`.
- No ANN index on the embedding vector column (see pgvector section above)
  — fine at V1 scale, revisit if the corpus grows very large.
- `SEMANTIC_ADJUDICATION` has its own queue/processor for a "re-run AI
  judgment" review action, but the primary judgment call happens inline
  within `IMPORT_MATCH` (not a separate queue hop) for latency reasons —
  documented in `src/worker/processors/semanticAdjudication.ts`.
- Media/audio ingestion (`MediaAsset`/`MediaSegment`) has schema support but
  no processing pipeline — intentionally out of scope per spec.
- Dataset export formats are JSONL/CSV only; Parquet is not implemented.
- Bulk review actions (multi-select) are not implemented in the Review
  Inbox UI.
- No billing/cost dashboard — token usage is recorded per `EnrichmentJob`
  but not yet aggregated/visualized.
