ALTER TABLE "Accommodation" ALTER COLUMN "status" SET DEFAULT 'pending';
UPDATE "Accommodation" SET "status" = 'pending' WHERE "status" = 'available';
