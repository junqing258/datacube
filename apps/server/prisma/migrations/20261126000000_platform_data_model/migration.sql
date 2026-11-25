-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SpaceMember" (
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "disabledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("spaceId", "userId"),
    CONSTRAINT "SpaceMember_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SpaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "settings" TEXT NOT NULL,
    "secretRef" TEXT,
    "disabledAt" DATETIME,
    "checkedAt" DATETIME,
    "checkStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DataConnection_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "grain" TEXT NOT NULL,
    "owner" TEXT,
    "kind" TEXT NOT NULL,
    "contract" TEXT NOT NULL,
    "timeFieldKey" TEXT,
    "disabledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Dataset_spaceId_connectionId_fkey" FOREIGN KEY ("spaceId", "connectionId") REFERENCES "DataConnection" ("spaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DatasetField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "semantics" TEXT,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DatasetField_spaceId_datasetId_fkey" FOREIGN KEY ("spaceId", "datasetId") REFERENCES "Dataset" ("spaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DatasetGrant" (
    "spaceId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    PRIMARY KEY ("spaceId", "datasetId", "userId"),
    CONSTRAINT "DatasetGrant_spaceId_datasetId_fkey" FOREIGN KEY ("spaceId", "datasetId") REFERENCES "Dataset" ("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DatasetGrant_spaceId_userId_fkey" FOREIGN KEY ("spaceId", "userId") REFERENCES "SpaceMember" ("spaceId", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FieldGrant" (
    "spaceId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "spaceMemberSpaceId" TEXT,
    "spaceMemberUserId" TEXT,

    PRIMARY KEY ("spaceId", "datasetId", "userId", "fieldId"),
    CONSTRAINT "FieldGrant_spaceId_datasetId_userId_fkey" FOREIGN KEY ("spaceId", "datasetId", "userId") REFERENCES "DatasetGrant" ("spaceId", "datasetId", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FieldGrant_spaceId_datasetId_fieldId_fkey" FOREIGN KEY ("spaceId", "datasetId", "fieldId") REFERENCES "DatasetField" ("spaceId", "datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FieldGrant_spaceMemberSpaceId_spaceMemberUserId_fkey" FOREIGN KEY ("spaceMemberSpaceId", "spaceMemberUserId") REFERENCES "SpaceMember" ("spaceId", "userId") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Metric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "definition" TEXT NOT NULL,
    CONSTRAINT "Metric_spaceId_datasetId_fkey" FOREIGN KEY ("spaceId", "datasetId") REFERENCES "Dataset" ("spaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DatasetJoin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "fromDatasetId" TEXT NOT NULL,
    "toDatasetId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "cardinality" TEXT NOT NULL,
    "fieldPairs" TEXT NOT NULL,
    CONSTRAINT "DatasetJoin_spaceId_connectionId_fromDatasetId_fkey" FOREIGN KEY ("spaceId", "connectionId", "fromDatasetId") REFERENCES "Dataset" ("spaceId", "connectionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DatasetJoin_spaceId_connectionId_toDatasetId_fkey" FOREIGN KEY ("spaceId", "connectionId", "toDatasetId") REFERENCES "Dataset" ("spaceId", "connectionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DatasetSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "storageRef" TEXT,
    "rowCount" INTEGER,
    "dataAsOf" DATETIME,
    "errorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "DatasetSnapshot_spaceId_datasetId_fkey" FOREIGN KEY ("spaceId", "datasetId") REFERENCES "Dataset" ("spaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActiveDatasetSnapshot" (
    "spaceId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,

    PRIMARY KEY ("spaceId", "datasetId"),
    CONSTRAINT "ActiveDatasetSnapshot_spaceId_datasetId_fkey" FOREIGN KEY ("spaceId", "datasetId") REFERENCES "Dataset" ("spaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ActiveDatasetSnapshot_spaceId_datasetId_snapshotId_fkey" FOREIGN KEY ("spaceId", "datasetId", "snapshotId") REFERENCES "DatasetSnapshot" ("spaceId", "datasetId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeGrant" (
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,

    PRIMARY KEY ("spaceId", "userId", "topic"),
    CONSTRAINT "KnowledgeGrant_spaceId_userId_fkey" FOREIGN KEY ("spaceId", "userId") REFERENCES "SpaceMember" ("spaceId", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QueryDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "spec" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QueryDefinition_spaceId_datasetId_fkey" FOREIGN KEY ("spaceId", "datasetId") REFERENCES "Dataset" ("spaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Chart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'web',
    "name" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Chart_spaceId_queryId_fkey" FOREIGN KEY ("spaceId", "queryId") REFERENCES "QueryDefinition" ("spaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Chart_spaceId_createdById_fkey" FOREIGN KEY ("spaceId", "createdById") REFERENCES "SpaceMember" ("spaceId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChartKnowledgeReference" (
    "spaceId" TEXT NOT NULL,
    "chartId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "version" INTEGER NOT NULL,

    PRIMARY KEY ("spaceId", "chartId", "topic", "version"),
    CONSTRAINT "ChartKnowledgeReference_spaceId_chartId_fkey" FOREIGN KEY ("spaceId", "chartId") REFERENCES "Chart" ("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dashboard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'web',
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "publishedAt" DATETIME,
    "archivedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "filters" TEXT NOT NULL DEFAULT '[]',
    "refreshPolicy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Dashboard_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Dashboard_spaceId_createdById_fkey" FOREIGN KEY ("spaceId", "createdById") REFERENCES "SpaceMember" ("spaceId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DashboardCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "chartId" TEXT NOT NULL,
    "titleOverride" TEXT,
    "layout" TEXT NOT NULL,
    "filterMapping" TEXT,
    CONSTRAINT "DashboardCard_spaceId_dashboardId_fkey" FOREIGN KEY ("spaceId", "dashboardId") REFERENCES "Dashboard" ("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DashboardCard_spaceId_chartId_fkey" FOREIGN KEY ("spaceId", "chartId") REFERENCES "Chart" ("spaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DashboardFavorite" (
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("spaceId", "userId", "dashboardId"),
    CONSTRAINT "DashboardFavorite_spaceId_userId_fkey" FOREIGN KEY ("spaceId", "userId") REFERENCES "SpaceMember" ("spaceId", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DashboardFavorite_spaceId_dashboardId_fkey" FOREIGN KEY ("spaceId", "dashboardId") REFERENCES "Dashboard" ("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DashboardGrant" (
    "spaceId" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'view',

    PRIMARY KEY ("spaceId", "dashboardId", "userId"),
    CONSTRAINT "DashboardGrant_spaceId_dashboardId_fkey" FOREIGN KEY ("spaceId", "dashboardId") REFERENCES "Dashboard" ("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DashboardGrant_spaceId_userId_fkey" FOREIGN KEY ("spaceId", "userId") REFERENCES "SpaceMember" ("spaceId", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiKey_spaceId_userId_fkey" FOREIGN KEY ("spaceId", "userId") REFERENCES "SpaceMember" ("spaceId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiKeyScope" (
    "apiKeyId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,

    PRIMARY KEY ("apiKeyId", "scope"),
    CONSTRAINT "ApiKeyScope_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QueryExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "origin" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "parameters" TEXT,
    "provenance" TEXT,
    "resultRef" TEXT,
    "resultExpiresAt" DATETIME,
    "rowCount" INTEGER,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "QueryExecution_spaceId_queryId_fkey" FOREIGN KEY ("spaceId", "queryId") REFERENCES "QueryDefinition" ("spaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QueryExecution_spaceId_userId_fkey" FOREIGN KEY ("spaceId", "userId") REFERENCES "SpaceMember" ("spaceId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QueryExecution_spaceId_userId_apiKeyId_fkey" FOREIGN KEY ("spaceId", "userId", "apiKeyId") REFERENCES "ApiKey" ("spaceId", "userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "origin" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_spaceId_userId_fkey" FOREIGN KEY ("spaceId", "userId") REFERENCES "SpaceMember" ("spaceId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_spaceId_userId_apiKeyId_fkey" FOREIGN KEY ("spaceId", "userId", "apiKeyId") REFERENCES "ApiKey" ("spaceId", "userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IdempotentMutation" (
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,

    PRIMARY KEY ("spaceId", "userId", "operation", "key"),
    CONSTRAINT "IdempotentMutation_spaceId_userId_fkey" FOREIGN KEY ("spaceId", "userId") REFERENCES "SpaceMember" ("spaceId", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Space_slug_key" ON "Space"("slug");

-- CreateIndex
CREATE INDEX "SpaceMember_userId_idx" ON "SpaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DataConnection_spaceId_id_key" ON "DataConnection"("spaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DataConnection_spaceId_name_key" ON "DataConnection"("spaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Dataset_spaceId_id_key" ON "Dataset"("spaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Dataset_spaceId_connectionId_id_key" ON "Dataset"("spaceId", "connectionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Dataset_spaceId_connectionId_key_key" ON "Dataset"("spaceId", "connectionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetField_spaceId_datasetId_id_key" ON "DatasetField"("spaceId", "datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetField_spaceId_datasetId_key_key" ON "DatasetField"("spaceId", "datasetId", "key");

-- CreateIndex
CREATE INDEX "DatasetGrant_spaceId_userId_idx" ON "DatasetGrant"("spaceId", "userId");

-- CreateIndex
CREATE INDEX "FieldGrant_spaceId_datasetId_fieldId_idx" ON "FieldGrant"("spaceId", "datasetId", "fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "Metric_spaceId_datasetId_key_key" ON "Metric"("spaceId", "datasetId", "key");

-- CreateIndex
CREATE INDEX "DatasetJoin_spaceId_connectionId_toDatasetId_idx" ON "DatasetJoin"("spaceId", "connectionId", "toDatasetId");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetJoin_spaceId_connectionId_fromDatasetId_key_key" ON "DatasetJoin"("spaceId", "connectionId", "fromDatasetId", "key");

-- CreateIndex
CREATE INDEX "DatasetSnapshot_spaceId_datasetId_createdAt_idx" ON "DatasetSnapshot"("spaceId", "datasetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetSnapshot_spaceId_datasetId_id_key" ON "DatasetSnapshot"("spaceId", "datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveDatasetSnapshot_spaceId_datasetId_snapshotId_key" ON "ActiveDatasetSnapshot"("spaceId", "datasetId", "snapshotId");

-- CreateIndex
CREATE INDEX "QueryDefinition_spaceId_datasetId_idx" ON "QueryDefinition"("spaceId", "datasetId");

-- CreateIndex
CREATE UNIQUE INDEX "QueryDefinition_spaceId_id_key" ON "QueryDefinition"("spaceId", "id");

-- CreateIndex
CREATE INDEX "Chart_spaceId_queryId_idx" ON "Chart"("spaceId", "queryId");

-- CreateIndex
CREATE INDEX "Chart_spaceId_createdById_idx" ON "Chart"("spaceId", "createdById");

-- CreateIndex
CREATE INDEX "Chart_spaceId_archivedAt_updatedAt_idx" ON "Chart"("spaceId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Chart_spaceId_id_key" ON "Chart"("spaceId", "id");

-- CreateIndex
CREATE INDEX "Dashboard_spaceId_archivedAt_updatedAt_idx" ON "Dashboard"("spaceId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "Dashboard_spaceId_createdById_idx" ON "Dashboard"("spaceId", "createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Dashboard_spaceId_id_key" ON "Dashboard"("spaceId", "id");

-- CreateIndex
CREATE INDEX "DashboardCard_spaceId_dashboardId_idx" ON "DashboardCard"("spaceId", "dashboardId");

-- CreateIndex
CREATE INDEX "DashboardCard_spaceId_chartId_idx" ON "DashboardCard"("spaceId", "chartId");

-- CreateIndex
CREATE INDEX "DashboardFavorite_spaceId_dashboardId_idx" ON "DashboardFavorite"("spaceId", "dashboardId");

-- CreateIndex
CREATE INDEX "DashboardGrant_spaceId_userId_idx" ON "DashboardGrant"("spaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_digest_key" ON "ApiKey"("digest");

-- CreateIndex
CREATE INDEX "ApiKey_spaceId_userId_createdAt_idx" ON "ApiKey"("spaceId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_spaceId_userId_id_key" ON "ApiKey"("spaceId", "userId", "id");

-- CreateIndex
CREATE INDEX "QueryExecution_status_createdAt_idx" ON "QueryExecution"("status", "createdAt");

-- CreateIndex
CREATE INDEX "QueryExecution_spaceId_queryId_createdAt_idx" ON "QueryExecution"("spaceId", "queryId", "createdAt");

-- CreateIndex
CREATE INDEX "QueryExecution_spaceId_userId_apiKeyId_createdAt_idx" ON "QueryExecution"("spaceId", "userId", "apiKeyId", "createdAt");

-- CreateIndex
CREATE INDEX "QueryExecution_resultExpiresAt_idx" ON "QueryExecution"("resultExpiresAt");

-- CreateIndex
CREATE INDEX "AuditEvent_spaceId_createdAt_idx" ON "AuditEvent"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_spaceId_userId_apiKeyId_createdAt_idx" ON "AuditEvent"("spaceId", "userId", "apiKeyId", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotentMutation_expiresAt_idx" ON "IdempotentMutation"("expiresAt");

