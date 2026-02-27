-- CreateTable
CREATE TABLE "TaskRoadmap" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskRoadmap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskRoadmap_taskId_key" ON "TaskRoadmap"("taskId");

-- CreateIndex
CREATE INDEX "TaskRoadmap_updatedAt_idx" ON "TaskRoadmap"("updatedAt");

-- AddForeignKey
ALTER TABLE "TaskRoadmap"
ADD CONSTRAINT "TaskRoadmap_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
