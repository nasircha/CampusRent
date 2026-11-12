CREATE TABLE "UserActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "college" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserActivity_event_createdAt_idx" ON "UserActivity"("event", "createdAt");
CREATE INDEX "UserActivity_email_createdAt_idx" ON "UserActivity"("email", "createdAt");
