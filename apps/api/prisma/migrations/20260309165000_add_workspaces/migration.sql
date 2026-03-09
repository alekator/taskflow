CREATE TYPE "WorkspaceMemberRole" AS ENUM ('ADMIN', 'MEMBER');

CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceMemberRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");
CREATE INDEX "WorkspaceMember_workspaceId_idx" ON "WorkspaceMember"("workspaceId");
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

ALTER TABLE "User" ADD COLUMN "defaultWorkspaceId" TEXT;
ALTER TABLE "Project" ADD COLUMN "workspaceId" TEXT;

INSERT INTO "Workspace" ("id", "name", "slug", "createdAt", "updatedAt")
VALUES ('ws_main', 'TaskFlow Main Workspace', 'main', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

WITH main_workspace AS (
  SELECT "id" FROM "Workspace" WHERE "slug" = 'main' LIMIT 1
)
UPDATE "Project"
SET "workspaceId" = (SELECT "id" FROM main_workspace)
WHERE "workspaceId" IS NULL;

WITH main_workspace AS (
  SELECT "id" FROM "Workspace" WHERE "slug" = 'main' LIMIT 1
)
INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "createdAt")
SELECT
  'wsm_' || SUBSTRING(MD5(u."id" || ':' || mw."id") FROM 1 FOR 24),
  mw."id",
  u."id",
  CASE WHEN u."role" = 'ADMIN' THEN 'ADMIN'::"WorkspaceMemberRole" ELSE 'MEMBER'::"WorkspaceMemberRole" END,
  CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN main_workspace mw
ON CONFLICT ("workspaceId", "userId") DO NOTHING;

WITH main_workspace AS (
  SELECT "id" FROM "Workspace" WHERE "slug" = 'main' LIMIT 1
)
UPDATE "User"
SET "defaultWorkspaceId" = (SELECT "id" FROM main_workspace)
WHERE "defaultWorkspaceId" IS NULL;

ALTER TABLE "Project" ALTER COLUMN "workspaceId" SET NOT NULL;

CREATE INDEX "Project_workspaceId_idx" ON "Project"("workspaceId");
CREATE INDEX "User_defaultWorkspaceId_idx" ON "User"("defaultWorkspaceId");

ALTER TABLE "WorkspaceMember"
ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceMember"
ADD CONSTRAINT "WorkspaceMember_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User"
ADD CONSTRAINT "User_defaultWorkspaceId_fkey"
FOREIGN KEY ("defaultWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project"
ADD CONSTRAINT "Project_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
