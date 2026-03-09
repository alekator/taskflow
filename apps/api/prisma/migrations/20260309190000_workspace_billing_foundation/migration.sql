CREATE TYPE "BillingProvider" AS ENUM ('NONE', 'STRIPE');
CREATE TYPE "WorkspaceSubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE');

CREATE TABLE "WorkspaceBilling" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL DEFAULT 'NONE',
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "status" "WorkspaceSubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "planCode" TEXT NOT NULL DEFAULT 'free',
    "seats" INTEGER NOT NULL DEFAULT 1,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceBilling_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceBilling_workspaceId_key" ON "WorkspaceBilling"("workspaceId");
CREATE UNIQUE INDEX "WorkspaceBilling_providerCustomerId_key" ON "WorkspaceBilling"("providerCustomerId");
CREATE INDEX "WorkspaceBilling_workspaceId_status_idx" ON "WorkspaceBilling"("workspaceId", "status");
CREATE INDEX "WorkspaceBilling_provider_providerSubscriptionId_idx" ON "WorkspaceBilling"("provider", "providerSubscriptionId");

CREATE TABLE "WorkspaceBillingEvent" (
    "id" TEXT NOT NULL,
    "workspaceBillingId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "payload" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceBillingEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceBillingEvent_workspaceBillingId_externalEventId_key" ON "WorkspaceBillingEvent"("workspaceBillingId", "externalEventId");
CREATE UNIQUE INDEX "WorkspaceBillingEvent_workspaceBillingId_idempotencyKey_key" ON "WorkspaceBillingEvent"("workspaceBillingId", "idempotencyKey");
CREATE INDEX "WorkspaceBillingEvent_workspaceBillingId_createdAt_idx" ON "WorkspaceBillingEvent"("workspaceBillingId", "createdAt");
CREATE INDEX "WorkspaceBillingEvent_source_type_idx" ON "WorkspaceBillingEvent"("source", "type");

ALTER TABLE "WorkspaceBilling"
ADD CONSTRAINT "WorkspaceBilling_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceBillingEvent"
ADD CONSTRAINT "WorkspaceBillingEvent_workspaceBillingId_fkey"
FOREIGN KEY ("workspaceBillingId") REFERENCES "WorkspaceBilling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "WorkspaceBilling" (
  "id",
  "workspaceId",
  "provider",
  "status",
  "planCode",
  "seats",
  "trialEndsAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'wb_' || SUBSTRING(MD5(w."id") FROM 1 FOR 24),
  w."id",
  'NONE'::"BillingProvider",
  'TRIALING'::"WorkspaceSubscriptionStatus",
  'free',
  1,
  CURRENT_TIMESTAMP + INTERVAL '14 days',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Workspace" w
ON CONFLICT ("workspaceId") DO NOTHING;
