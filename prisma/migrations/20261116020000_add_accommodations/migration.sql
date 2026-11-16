CREATE TABLE "Accommodation" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "price" INTEGER NOT NULL,
    "priceUnit" TEXT NOT NULL DEFAULT 'BED',
    "totalRooms" INTEGER NOT NULL DEFAULT 1,
    "vacantRooms" INTEGER NOT NULL DEFAULT 0,
    "totalBeds" INTEGER NOT NULL DEFAULT 0,
    "vacantBeds" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "college" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Accommodation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Accommodation_college_type_status_createdAt_idx" ON "Accommodation"("college", "type", "status", "createdAt");
CREATE INDEX "Accommodation_ownerId_status_idx" ON "Accommodation"("ownerId", "status");
ALTER TABLE "Accommodation" ADD CONSTRAINT "Accommodation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
