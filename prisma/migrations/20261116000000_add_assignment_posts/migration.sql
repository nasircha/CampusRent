CREATE TABLE "AssignmentPost" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "description" VARCHAR(1200) NOT NULL,
  "sampleUrl" TEXT NOT NULL DEFAULT '',
  "sampleName" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "AssignmentPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssignmentPost_kind_createdAt_idx" ON "AssignmentPost"("kind", "createdAt");
CREATE INDEX "AssignmentPost_userId_createdAt_idx" ON "AssignmentPost"("userId", "createdAt");
ALTER TABLE "AssignmentPost" ADD CONSTRAINT "AssignmentPost_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
