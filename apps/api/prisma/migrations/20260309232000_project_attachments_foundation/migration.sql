CREATE TABLE "ProjectAttachment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
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

    CONSTRAINT "ProjectAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectAttachment_objectKey_key" ON "ProjectAttachment"("objectKey");
CREATE INDEX "ProjectAttachment_projectId_status_idx" ON "ProjectAttachment"("projectId", "status");
CREATE INDEX "ProjectAttachment_uploadedByUserId_createdAt_idx" ON "ProjectAttachment"("uploadedByUserId", "createdAt");
CREATE INDEX "ProjectAttachment_createdAt_idx" ON "ProjectAttachment"("createdAt");

ALTER TABLE "ProjectAttachment"
ADD CONSTRAINT "ProjectAttachment_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectAttachment"
ADD CONSTRAINT "ProjectAttachment_uploadedByUserId_fkey"
FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
