-- CreateTable
CREATE TABLE "QueryDatasetBinding" (
    "spaceId" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,

    PRIMARY KEY ("spaceId", "queryId", "alias"),
    CONSTRAINT "QueryDatasetBinding_spaceId_queryId_fkey" FOREIGN KEY ("spaceId", "queryId") REFERENCES "QueryDefinition" ("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QueryDatasetBinding_spaceId_datasetId_fkey" FOREIGN KEY ("spaceId", "datasetId") REFERENCES "Dataset" ("spaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "QueryDatasetBinding_spaceId_datasetId_idx" ON "QueryDatasetBinding"("spaceId", "datasetId");
