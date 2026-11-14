CREATE TABLE "CollegeId" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "encryptedData" BYTEA NOT NULL,
  "iv" BYTEA NOT NULL,
  "authTag" BYTEA NOT NULL,
  "mimeType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollegeId_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RentalCollegeId" (
  "id" TEXT NOT NULL,
  "rentalId" TEXT NOT NULL,
  "encryptedData" BYTEA NOT NULL,
  "iv" BYTEA NOT NULL,
  "authTag" BYTEA NOT NULL,
  "mimeType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalCollegeId_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CollegeId_userId_key" ON "CollegeId"("userId");
CREATE UNIQUE INDEX "RentalCollegeId_rentalId_key" ON "RentalCollegeId"("rentalId");
CREATE INDEX "RentalCollegeId_status_createdAt_idx" ON "RentalCollegeId"("status", "createdAt");
ALTER TABLE "CollegeId" ADD CONSTRAINT "CollegeId_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RentalCollegeId" ADD CONSTRAINT "RentalCollegeId_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE CASCADE ON UPDATE CASCADE;
