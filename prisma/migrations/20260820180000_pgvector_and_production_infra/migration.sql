-- Enable pgvector. Safe to run against a clean database or an existing V1
-- database that doesn't have it yet.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "EmbeddingEntityType" AS ENUM ('CONCEPT', 'SENTENCE', 'EXPRESSION');

-- AlterEnum
ALTER TYPE "ImportJobStatus" ADD VALUE 'QUEUED';

-- DropIndex
DROP INDEX "ImportRow_jobId_idx";

-- AlterTable
ALTER TABLE "EnrichmentJob" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "completionTokens" INTEGER,
ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "promptTokens" INTEGER,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "totalTokens" INTEGER;

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "processedRows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "semanticCandidates" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ImportRow" ADD COLUMN     "processedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "fileSize" INTEGER,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "objectKey" TEXT,
ADD COLUMN     "storedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DatasetExport" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "split" TEXT,
    "objectKey" TEXT NOT NULL,
    "fileSize" INTEGER,
    "checksum" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Embedding" (
    "id" TEXT NOT NULL,
    "entityType" "EmbeddingEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "sourceText" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "vector" vector(3072) NOT NULL,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DatasetExport_datasetId_idx" ON "DatasetExport"("datasetId");

-- CreateIndex
CREATE INDEX "Embedding_entityType_stale_idx" ON "Embedding"("entityType", "stale");

-- CreateIndex
CREATE UNIQUE INDEX "Embedding_entityType_entityId_key" ON "Embedding"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "EnrichmentJob_type_createdAt_idx" ON "EnrichmentJob"("type", "createdAt");

-- CreateIndex
CREATE INDEX "ImportRow_jobId_status_idx" ON "ImportRow"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_jobId_rowIndex_key" ON "ImportRow"("jobId", "rowIndex");

-- CreateIndex
CREATE INDEX "Source_checksum_idx" ON "Source"("checksum");

-- AddForeignKey
ALTER TABLE "DatasetExport" ADD CONSTRAINT "DatasetExport_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DatasetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- NOTE: pgvector's HNSW/IVFFlat index types cap at 2000 dimensions, but
-- text-embedding-3-large produces 3072-dim vectors, so no ANN index is
-- created here. Candidate retrieval uses exact KNN (`ORDER BY vector <=>
-- $1 LIMIT k`), which is correct and fast enough at V1 corpus scale. If
-- the corpus grows large enough to need approximate search, either switch
-- OPENAI_EMBEDDING_DIMENSIONS to <=2000 (OpenAI embeddings support
-- truncation via the API `dimensions` param) and add an HNSW index in a
-- follow-up migration, or move to a dedicated vector index/service.

