-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER');

-- CreateEnum
CREATE TYPE "QualityTier" AS ENUM ('GOLD', 'SILVER', 'REFERENCE', 'CANDIDATE');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TrainingEligibility" AS ENUM ('ELIGIBLE', 'NOT_ELIGIBLE', 'UNDECIDED');

-- CreateEnum
CREATE TYPE "Origin" AS ENUM ('HUMAN', 'IMPORT', 'AI', 'REFERENCE');

-- CreateEnum
CREATE TYPE "Commonness" AS ENUM ('VERY_HIGH', 'HIGH', 'MEDIUM', 'LOW', 'RARE', 'CONTEXTUAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Naturalness" AS ENUM ('NATURAL', 'ACCEPTABLE', 'UNNATURAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RejectionReason" AS ENUM ('UNNATURAL', 'TOO_FORMAL', 'SOUNDS_MSA', 'WRONG_DIALECT', 'WRONG_CONTEXT', 'OUTDATED', 'INCORRECT', 'POOR_TRANSLATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpressionType" AS ENUM ('WORD', 'PHRASE', 'IDIOM', 'SLANG', 'GREETING', 'FORMULA', 'FILLER', 'DISCOURSE_MARKER', 'EXPRESSION');

-- CreateEnum
CREATE TYPE "ExpressionRelationType" AS ENUM ('SYNONYM', 'NEAR_SYNONYM', 'DIALECT_EQUIVALENT', 'TRANSLATION', 'REGIONAL_VARIANT', 'SPELLING_VARIANT', 'PRONUNCIATION_VARIANT', 'FORMAL_EQUIVALENT', 'INFORMAL_EQUIVALENT', 'SLANG_EQUIVALENT', 'RELATED', 'COMMON_RESPONSE');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('MANUAL', 'XLSX', 'CSV', 'TXT', 'PASTE', 'AI', 'REFERENCE', 'AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'MAPPING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('PENDING', 'ACCEPTED', 'MATCHED', 'CONFLICT', 'ERROR', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ReviewItemType" AS ENUM ('SEMANTIC_CONFLICT', 'DUPLICATE', 'DIALECT_UNCERTAIN', 'MEANING_UNCERTAIN', 'AI_SUGGESTION', 'SENTENCE_ALIGNMENT', 'RESPONSE_PATTERN', 'PRONUNCIATION', 'TRANSLATION');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReviewResolution" AS ENUM ('APPROVED', 'ADDED_SYNONYM', 'ADDED_VARIANT', 'ADDED_DIALECT_EQUIVALENT', 'DIFFERENT_MEANING', 'DIFFERENT_DIALECT', 'REPLACED', 'EDITED', 'REJECTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "RevisionKind" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE');

-- CreateEnum
CREATE TYPE "DatasetStatus" AS ENUM ('DRAFT', 'BUILT', 'EXPORTED');

-- CreateEnum
CREATE TYPE "DatasetSplit" AS ENUM ('TRAIN', 'VALIDATION', 'TEST');

-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Language" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'ltr',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DialectNode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DialectNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT,
    "parentId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Intent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Intent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Situation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Situation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Register" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Register_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationalFunction" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConversationalFunction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "gloss" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "origin" "Origin" NOT NULL DEFAULT 'HUMAN',
    "sourceId" TEXT,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expression" (
    "id" TEXT NOT NULL,
    "textOriginal" TEXT NOT NULL,
    "textNormalized" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "dialectId" TEXT,
    "type" "ExpressionType" NOT NULL DEFAULT 'EXPRESSION',
    "registerId" TEXT,
    "commonness" "Commonness" NOT NULL DEFAULT 'UNKNOWN',
    "meaningNote" TEXT,
    "usageNote" TEXT,
    "quality" "QualityTier" NOT NULL DEFAULT 'CANDIDATE',
    "verification" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "training" "TrainingEligibility" NOT NULL DEFAULT 'UNDECIDED',
    "trainingNote" TEXT,
    "origin" "Origin" NOT NULL DEFAULT 'HUMAN',
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "aiGeneratedAt" TIMESTAMP(3),
    "sourceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "rejectionReason" "RejectionReason",
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptExpression" (
    "id" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "expressionId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "senseNote" TEXT,

    CONSTRAINT "ConceptExpression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpressionRelation" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "type" "ExpressionRelationType" NOT NULL,
    "notes" TEXT,
    "origin" "Origin" NOT NULL DEFAULT 'HUMAN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpressionRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpressionCategory" (
    "expressionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "ExpressionCategory_pkey" PRIMARY KEY ("expressionId","categoryId")
);

-- CreateTable
CREATE TABLE "Pronunciation" (
    "id" TEXT NOT NULL,
    "expressionId" TEXT,
    "sentenceId" TEXT,
    "dialectId" TEXT,
    "arabicPhonetic" TEXT,
    "diacritized" TEXT,
    "ipa" TEXT,
    "notes" TEXT,
    "isVariant" BOOLEAN NOT NULL DEFAULT false,
    "variantLabel" TEXT,
    "verification" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "origin" "Origin" NOT NULL DEFAULT 'HUMAN',
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "aiGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pronunciation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UtteranceGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meaning" TEXT,
    "intentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtteranceGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sentence" (
    "id" TEXT NOT NULL,
    "textOriginal" TEXT NOT NULL,
    "textNormalized" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "dialectId" TEXT,
    "meaning" TEXT,
    "literalNote" TEXT,
    "utteranceGroupId" TEXT,
    "intentId" TEXT,
    "situationId" TEXT,
    "registerId" TEXT,
    "functionId" TEXT,
    "naturalness" "Naturalness" NOT NULL DEFAULT 'UNKNOWN',
    "commonness" "Commonness" NOT NULL DEFAULT 'UNKNOWN',
    "isCorrect" BOOLEAN,
    "dialectConfidence" TEXT,
    "quality" "QualityTier" NOT NULL DEFAULT 'CANDIDATE',
    "verification" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "training" "TrainingEligibility" NOT NULL DEFAULT 'UNDECIDED',
    "trainingNote" TEXT,
    "origin" "Origin" NOT NULL DEFAULT 'HUMAN',
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "aiGeneratedAt" TIMESTAMP(3),
    "sourceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "rejectionReason" "RejectionReason",
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sentence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentenceConcept" (
    "sentenceId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,

    CONSTRAINT "SentenceConcept_pkey" PRIMARY KEY ("sentenceId","conceptId")
);

-- CreateTable
CREATE TABLE "SentenceExpression" (
    "sentenceId" TEXT NOT NULL,
    "expressionId" TEXT NOT NULL,

    CONSTRAINT "SentenceExpression_pkey" PRIMARY KEY ("sentenceId","expressionId")
);

-- CreateTable
CREATE TABLE "SentenceCategory" (
    "sentenceId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "SentenceCategory_pkey" PRIMARY KEY ("sentenceId","categoryId")
);

-- CreateTable
CREATE TABLE "SentenceTopic" (
    "sentenceId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,

    CONSTRAINT "SentenceTopic_pkey" PRIMARY KEY ("sentenceId","topicId")
);

-- CreateTable
CREATE TABLE "ResponsePattern" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "intentId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResponsePattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponseTrigger" (
    "id" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "textOriginal" TEXT NOT NULL,
    "textNormalized" TEXT NOT NULL,
    "dialectId" TEXT,
    "sentenceId" TEXT,
    "expressionId" TEXT,
    "origin" "Origin" NOT NULL DEFAULT 'HUMAN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResponseTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponseVariant" (
    "id" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "textOriginal" TEXT NOT NULL,
    "textNormalized" TEXT NOT NULL,
    "dialectId" TEXT,
    "sentenceId" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 10,
    "commonness" "Commonness" NOT NULL DEFAULT 'UNKNOWN',
    "corpusFrequency" INTEGER,
    "notes" TEXT,
    "quality" "QualityTier" NOT NULL DEFAULT 'CANDIDATE',
    "verification" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "origin" "Origin" NOT NULL DEFAULT 'HUMAN',
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "aiGeneratedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "rejectionReason" "RejectionReason",
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResponseVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dialectId" TEXT,
    "situationId" TEXT,
    "quality" "QualityTier" NOT NULL DEFAULT 'CANDIDATE',
    "verification" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "training" "TrainingEligibility" NOT NULL DEFAULT 'UNDECIDED',
    "origin" "Origin" NOT NULL DEFAULT 'HUMAN',
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationTurn" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "speaker" TEXT NOT NULL,
    "textOriginal" TEXT NOT NULL,
    "textNormalized" TEXT NOT NULL,
    "dialectId" TEXT,
    "sentenceId" TEXT,
    "intentId" TEXT,
    "functionId" TEXT,
    "notes" TEXT,
    "startMs" INTEGER,
    "endMs" INTEGER,

    CONSTRAINT "ConversationTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationCategory" (
    "conversationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "ConversationCategory_pkey" PRIMARY KEY ("conversationId","categoryId")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "filename" TEXT,
    "description" TEXT,
    "license" TEXT,
    "reliability" TEXT,
    "defaultTraining" "TrainingEligibility" NOT NULL DEFAULT 'UNDECIDED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "filename" TEXT,
    "fileFormat" TEXT,
    "mapping" JSONB,
    "defaults" JSONB,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "accepted" INTEGER NOT NULL DEFAULT 0,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "conflicts" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "errorLog" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "entityType" TEXT,
    "entityId" TEXT,
    "message" TEXT,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewItem" (
    "id" TEXT NOT NULL,
    "type" "ReviewItemType" NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "candidateEntityId" TEXT,
    "importJobId" TEXT,
    "resolution" "ReviewResolution",
    "resolutionNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" "RevisionKind" NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "viewKey" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetVersion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "filters" JSONB NOT NULL,
    "splitStrategy" JSONB NOT NULL,
    "counts" JSONB,
    "exportSchema" TEXT NOT NULL DEFAULT 'standard',
    "status" "DatasetStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "builtAt" TIMESTAMP(3),

    CONSTRAINT "DatasetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetRecord" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "split" "DatasetSplit" NOT NULL,
    "groupKey" TEXT,

    CONSTRAINT "DatasetRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrichmentJob" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "EnrichmentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "kind" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaSegment" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "transcript" TEXT,
    "sentenceId" TEXT,
    "speaker" TEXT,

    CONSTRAINT "MediaSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Language_code_key" ON "Language"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DialectNode_slug_key" ON "DialectNode"("slug");

-- CreateIndex
CREATE INDEX "DialectNode_parentId_idx" ON "DialectNode"("parentId");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_name_key" ON "Topic"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Intent_name_key" ON "Intent"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Situation_name_key" ON "Situation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Register_name_key" ON "Register"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationalFunction_name_key" ON "ConversationalFunction"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Concept_key_key" ON "Concept"("key");

-- CreateIndex
CREATE INDEX "Expression_textNormalized_idx" ON "Expression"("textNormalized");

-- CreateIndex
CREATE INDEX "Expression_languageId_idx" ON "Expression"("languageId");

-- CreateIndex
CREATE INDEX "Expression_dialectId_idx" ON "Expression"("dialectId");

-- CreateIndex
CREATE INDEX "Expression_quality_idx" ON "Expression"("quality");

-- CreateIndex
CREATE INDEX "Expression_verification_idx" ON "Expression"("verification");

-- CreateIndex
CREATE INDEX "ConceptExpression_expressionId_idx" ON "ConceptExpression"("expressionId");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptExpression_conceptId_expressionId_key" ON "ConceptExpression"("conceptId", "expressionId");

-- CreateIndex
CREATE INDEX "ExpressionRelation_toId_idx" ON "ExpressionRelation"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpressionRelation_fromId_toId_type_key" ON "ExpressionRelation"("fromId", "toId", "type");

-- CreateIndex
CREATE INDEX "Pronunciation_expressionId_idx" ON "Pronunciation"("expressionId");

-- CreateIndex
CREATE INDEX "Pronunciation_sentenceId_idx" ON "Pronunciation"("sentenceId");

-- CreateIndex
CREATE INDEX "Sentence_textNormalized_idx" ON "Sentence"("textNormalized");

-- CreateIndex
CREATE INDEX "Sentence_languageId_idx" ON "Sentence"("languageId");

-- CreateIndex
CREATE INDEX "Sentence_dialectId_idx" ON "Sentence"("dialectId");

-- CreateIndex
CREATE INDEX "Sentence_utteranceGroupId_idx" ON "Sentence"("utteranceGroupId");

-- CreateIndex
CREATE INDEX "Sentence_quality_idx" ON "Sentence"("quality");

-- CreateIndex
CREATE INDEX "Sentence_verification_idx" ON "Sentence"("verification");

-- CreateIndex
CREATE INDEX "Sentence_sourceId_idx" ON "Sentence"("sourceId");

-- CreateIndex
CREATE INDEX "ResponseTrigger_patternId_idx" ON "ResponseTrigger"("patternId");

-- CreateIndex
CREATE INDEX "ResponseTrigger_textNormalized_idx" ON "ResponseTrigger"("textNormalized");

-- CreateIndex
CREATE INDEX "ResponseVariant_patternId_idx" ON "ResponseVariant"("patternId");

-- CreateIndex
CREATE INDEX "ResponseVariant_textNormalized_idx" ON "ResponseVariant"("textNormalized");

-- CreateIndex
CREATE INDEX "ConversationTurn_textNormalized_idx" ON "ConversationTurn"("textNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationTurn_conversationId_orderIndex_key" ON "ConversationTurn"("conversationId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ImportTemplate_name_key" ON "ImportTemplate"("name");

-- CreateIndex
CREATE INDEX "ImportRow_jobId_idx" ON "ImportRow"("jobId");

-- CreateIndex
CREATE INDEX "ImportRow_entityId_idx" ON "ImportRow"("entityId");

-- CreateIndex
CREATE INDEX "ReviewItem_status_type_idx" ON "ReviewItem"("status", "type");

-- CreateIndex
CREATE INDEX "ReviewItem_entityId_idx" ON "ReviewItem"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_name_key" ON "Collection"("name");

-- CreateIndex
CREATE INDEX "CollectionItem_entityType_entityId_idx" ON "CollectionItem"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionItem_collectionId_entityType_entityId_key" ON "CollectionItem"("collectionId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Revision_entityType_entityId_idx" ON "Revision"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "SavedView_userId_viewKey_name_key" ON "SavedView"("userId", "viewKey", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetVersion_name_version_key" ON "DatasetVersion"("name", "version");

-- CreateIndex
CREATE INDEX "DatasetRecord_datasetId_split_idx" ON "DatasetRecord"("datasetId", "split");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetRecord_datasetId_entityType_entityId_key" ON "DatasetRecord"("datasetId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "EnrichmentJob_status_idx" ON "EnrichmentJob"("status");

-- CreateIndex
CREATE INDEX "EnrichmentJob_entityType_entityId_idx" ON "EnrichmentJob"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "MediaSegment_assetId_idx" ON "MediaSegment"("assetId");

-- AddForeignKey
ALTER TABLE "DialectNode" ADD CONSTRAINT "DialectNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DialectNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expression" ADD CONSTRAINT "Expression_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expression" ADD CONSTRAINT "Expression_dialectId_fkey" FOREIGN KEY ("dialectId") REFERENCES "DialectNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expression" ADD CONSTRAINT "Expression_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "Register"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expression" ADD CONSTRAINT "Expression_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptExpression" ADD CONSTRAINT "ConceptExpression_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptExpression" ADD CONSTRAINT "ConceptExpression_expressionId_fkey" FOREIGN KEY ("expressionId") REFERENCES "Expression"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressionRelation" ADD CONSTRAINT "ExpressionRelation_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Expression"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressionRelation" ADD CONSTRAINT "ExpressionRelation_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Expression"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressionCategory" ADD CONSTRAINT "ExpressionCategory_expressionId_fkey" FOREIGN KEY ("expressionId") REFERENCES "Expression"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressionCategory" ADD CONSTRAINT "ExpressionCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pronunciation" ADD CONSTRAINT "Pronunciation_expressionId_fkey" FOREIGN KEY ("expressionId") REFERENCES "Expression"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pronunciation" ADD CONSTRAINT "Pronunciation_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "Sentence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pronunciation" ADD CONSTRAINT "Pronunciation_dialectId_fkey" FOREIGN KEY ("dialectId") REFERENCES "DialectNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtteranceGroup" ADD CONSTRAINT "UtteranceGroup_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "Intent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sentence" ADD CONSTRAINT "Sentence_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sentence" ADD CONSTRAINT "Sentence_dialectId_fkey" FOREIGN KEY ("dialectId") REFERENCES "DialectNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sentence" ADD CONSTRAINT "Sentence_utteranceGroupId_fkey" FOREIGN KEY ("utteranceGroupId") REFERENCES "UtteranceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sentence" ADD CONSTRAINT "Sentence_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "Intent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sentence" ADD CONSTRAINT "Sentence_situationId_fkey" FOREIGN KEY ("situationId") REFERENCES "Situation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sentence" ADD CONSTRAINT "Sentence_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "Register"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sentence" ADD CONSTRAINT "Sentence_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "ConversationalFunction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sentence" ADD CONSTRAINT "Sentence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentenceConcept" ADD CONSTRAINT "SentenceConcept_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "Sentence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentenceConcept" ADD CONSTRAINT "SentenceConcept_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentenceExpression" ADD CONSTRAINT "SentenceExpression_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "Sentence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentenceExpression" ADD CONSTRAINT "SentenceExpression_expressionId_fkey" FOREIGN KEY ("expressionId") REFERENCES "Expression"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentenceCategory" ADD CONSTRAINT "SentenceCategory_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "Sentence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentenceCategory" ADD CONSTRAINT "SentenceCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentenceTopic" ADD CONSTRAINT "SentenceTopic_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "Sentence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentenceTopic" ADD CONSTRAINT "SentenceTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponsePattern" ADD CONSTRAINT "ResponsePattern_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "Intent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseTrigger" ADD CONSTRAINT "ResponseTrigger_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "ResponsePattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseTrigger" ADD CONSTRAINT "ResponseTrigger_dialectId_fkey" FOREIGN KEY ("dialectId") REFERENCES "DialectNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseTrigger" ADD CONSTRAINT "ResponseTrigger_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "Sentence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseTrigger" ADD CONSTRAINT "ResponseTrigger_expressionId_fkey" FOREIGN KEY ("expressionId") REFERENCES "Expression"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseVariant" ADD CONSTRAINT "ResponseVariant_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "ResponsePattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseVariant" ADD CONSTRAINT "ResponseVariant_dialectId_fkey" FOREIGN KEY ("dialectId") REFERENCES "DialectNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseVariant" ADD CONSTRAINT "ResponseVariant_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "Sentence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_dialectId_fkey" FOREIGN KEY ("dialectId") REFERENCES "DialectNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_situationId_fkey" FOREIGN KEY ("situationId") REFERENCES "Situation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_dialectId_fkey" FOREIGN KEY ("dialectId") REFERENCES "DialectNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "Sentence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "Intent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "ConversationalFunction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationCategory" ADD CONSTRAINT "ConversationCategory_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationCategory" ADD CONSTRAINT "ConversationCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRecord" ADD CONSTRAINT "DatasetRecord_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DatasetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaSegment" ADD CONSTRAINT "MediaSegment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
