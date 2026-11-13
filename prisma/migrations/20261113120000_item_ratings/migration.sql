CREATE TABLE "ItemRating" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ItemRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ItemRating_itemId_userId_key" ON "ItemRating"("itemId", "userId");
CREATE INDEX "ItemRating_userId_updatedAt_idx" ON "ItemRating"("userId", "updatedAt");

ALTER TABLE "ItemRating" ADD CONSTRAINT "ItemRating_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemRating" ADD CONSTRAINT "ItemRating_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
