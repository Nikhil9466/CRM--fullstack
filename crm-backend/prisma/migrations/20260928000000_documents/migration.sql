CREATE TABLE "Document" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "size" INTEGER NOT NULL,
  "content" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Document_uploader_fkey" FOREIGN KEY ("orgId", "uploaderId") REFERENCES "users"("orgId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Document_orgId_createdAt_idx" ON "Document"("orgId", "createdAt");
CREATE INDEX "Document_uploaderId_idx" ON "Document"("uploaderId");
