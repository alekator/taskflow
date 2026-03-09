CREATE TYPE "AsyncJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "AsyncJob" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "AsyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsyncJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AsyncJob_dedupeKey_key" ON "AsyncJob"("dedupeKey");
CREATE INDEX "AsyncJob_status_runAt_idx" ON "AsyncJob"("status", "runAt");
CREATE INDEX "AsyncJob_type_status_idx" ON "AsyncJob"("type", "status");
