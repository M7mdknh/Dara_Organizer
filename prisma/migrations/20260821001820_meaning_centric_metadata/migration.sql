-- AlterTable
ALTER TABLE "Concept" ADD COLUMN     "canonicalMsa" TEXT,
ADD COLUMN     "definitionAr" TEXT;

-- AlterTable
ALTER TABLE "DialectNode" ADD COLUMN     "aiContext" TEXT,
ADD COLUMN     "region" TEXT;

-- AlterTable
ALTER TABLE "Language" ADD COLUMN     "aiEnrichmentEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "nativeName" TEXT,
ADD COLUMN     "script" TEXT NOT NULL DEFAULT 'Latin';
