-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "spaceId" TEXT,
    "digest" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QueryResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "columns" TEXT NOT NULL,
    "rows" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "QueryResult_spaceId_executionId_fkey" FOREIGN KEY ("spaceId", "executionId") REFERENCES "QueryExecution" ("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChartLatestResult" (
    "spaceId" TEXT NOT NULL,
    "chartId" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "parameterDigest" TEXT NOT NULL,
    "scopeDigest" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("spaceId", "chartId", "queryId", "parameterDigest", "scopeDigest"),
    CONSTRAINT "ChartLatestResult_spaceId_chartId_fkey" FOREIGN KEY ("spaceId", "chartId") REFERENCES "Chart" ("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChartLatestResult_spaceId_executionId_fkey" FOREIGN KEY ("spaceId", "executionId") REFERENCES "QueryExecution" ("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Dashboard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'custom',
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
INSERT INTO "new_Dashboard" ("archivedAt", "createdAt", "createdById", "description", "filters", "id", "name", "origin", "publishedAt", "refreshPolicy", "spaceId", "updatedAt", "version", "visibility") SELECT "archivedAt", "createdAt", "createdById", "description", "filters", "id", "name", "origin", "publishedAt", "refreshPolicy", "spaceId", "updatedAt", "version", "visibility" FROM "Dashboard";
DROP TABLE "Dashboard";
ALTER TABLE "new_Dashboard" RENAME TO "Dashboard";
CREATE INDEX "Dashboard_spaceId_archivedAt_updatedAt_idx" ON "Dashboard"("spaceId", "archivedAt", "updatedAt");
CREATE INDEX "Dashboard_spaceId_createdById_idx" ON "Dashboard"("spaceId", "createdById");
CREATE UNIQUE INDEX "Dashboard_spaceId_id_key" ON "Dashboard"("spaceId", "id");
CREATE TABLE "new_DashboardCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "chartId" TEXT NOT NULL,
    "titleOverride" TEXT,
    "layout" TEXT NOT NULL DEFAULT '{}',
    "position" INTEGER NOT NULL DEFAULT 0,
    "filterMapping" TEXT,
    CONSTRAINT "DashboardCard_spaceId_dashboardId_fkey" FOREIGN KEY ("spaceId", "dashboardId") REFERENCES "Dashboard" ("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DashboardCard_spaceId_chartId_fkey" FOREIGN KEY ("spaceId", "chartId") REFERENCES "Chart" ("spaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DashboardCard" ("chartId", "dashboardId", "filterMapping", "id", "layout", "spaceId", "titleOverride") SELECT "chartId", "dashboardId", "filterMapping", "id", "layout", "spaceId", "titleOverride" FROM "DashboardCard";
DROP TABLE "DashboardCard";
ALTER TABLE "new_DashboardCard" RENAME TO "DashboardCard";
CREATE INDEX "DashboardCard_spaceId_dashboardId_position_idx" ON "DashboardCard"("spaceId", "dashboardId", "position");
CREATE INDEX "DashboardCard_spaceId_chartId_idx" ON "DashboardCard"("spaceId", "chartId");
CREATE TABLE "new_QueryExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "chartId" TEXT,
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
    CONSTRAINT "QueryExecution_spaceId_chartId_fkey" FOREIGN KEY ("spaceId", "chartId") REFERENCES "Chart" ("spaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QueryExecution_spaceId_userId_fkey" FOREIGN KEY ("spaceId", "userId") REFERENCES "SpaceMember" ("spaceId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QueryExecution_spaceId_userId_apiKeyId_fkey" FOREIGN KEY ("spaceId", "userId", "apiKeyId") REFERENCES "ApiKey" ("spaceId", "userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_QueryExecution" ("apiKeyId", "completedAt", "createdAt", "errorCode", "id", "origin", "parameters", "provenance", "queryId", "resultExpiresAt", "resultRef", "rowCount", "spaceId", "startedAt", "status", "truncated", "userId") SELECT "apiKeyId", "completedAt", "createdAt", "errorCode", "id", "origin", "parameters", "provenance", "queryId", "resultExpiresAt", "resultRef", "rowCount", "spaceId", "startedAt", "status", "truncated", "userId" FROM "QueryExecution";
DROP TABLE "QueryExecution";
ALTER TABLE "new_QueryExecution" RENAME TO "QueryExecution";
CREATE INDEX "QueryExecution_status_createdAt_idx" ON "QueryExecution"("status", "createdAt");
CREATE INDEX "QueryExecution_spaceId_queryId_createdAt_idx" ON "QueryExecution"("spaceId", "queryId", "createdAt");
CREATE INDEX "QueryExecution_spaceId_chartId_createdAt_idx" ON "QueryExecution"("spaceId", "chartId", "createdAt");
CREATE INDEX "QueryExecution_spaceId_userId_apiKeyId_createdAt_idx" ON "QueryExecution"("spaceId", "userId", "apiKeyId", "createdAt");
CREATE INDEX "QueryExecution_resultExpiresAt_idx" ON "QueryExecution"("resultExpiresAt");
CREATE UNIQUE INDEX "QueryExecution_spaceId_id_key" ON "QueryExecution"("spaceId", "id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Session_digest_key" ON "Session"("digest");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "QueryResult_spaceId_expiresAt_idx" ON "QueryResult"("spaceId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "QueryResult_spaceId_executionId_key" ON "QueryResult"("spaceId", "executionId");

-- CreateIndex
CREATE INDEX "ChartLatestResult_spaceId_chartId_idx" ON "ChartLatestResult"("spaceId", "chartId");
