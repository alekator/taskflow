CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'AVAILABLE', 'DELETED');

CREATE TABLE "TaskAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "uploadTokenHash" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskAttachment_objectKey_key" ON "TaskAttachment"("objectKey");
CREATE INDEX "TaskAttachment_taskId_status_idx" ON "TaskAttachment"("taskId", "status");
CREATE INDEX "TaskAttachment_uploadedByUserId_createdAt_idx" ON "TaskAttachment"("uploadedByUserId", "createdAt");
CREATE INDEX "TaskAttachment_createdAt_idx" ON "TaskAttachment"("createdAt");

ALTER TABLE "TaskAttachment"
ADD CONSTRAINT "TaskAttachment_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskAttachment"
ADD CONSTRAINT "TaskAttachment_uploadedByUserId_fkey"
FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
