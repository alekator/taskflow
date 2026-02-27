-- CreateEnum
CREATE TYPE "AssistantMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "AssistantMessageMode" AS ENUM ('BASIC', 'LLM');

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AssistantMessageRole" NOT NULL,
    "mode" "AssistantMessageMode" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantMessage_userId_createdAt_idx" ON "AssistantMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantMessage_createdAt_idx" ON "AssistantMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "AssistantMessage"
ADD CONSTRAINT "AssistantMessage_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
