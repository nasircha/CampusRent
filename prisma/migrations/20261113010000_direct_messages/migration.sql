CREATE TABLE "DirectMessageRequest" (
  "id" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "receiverId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DirectMessageRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DirectMessageRequest_senderId_receiverId_key" ON "DirectMessageRequest"("senderId", "receiverId");
CREATE INDEX "DirectMessageRequest_receiverId_status_createdAt_idx" ON "DirectMessageRequest"("receiverId", "status", "createdAt");
CREATE INDEX "DirectMessageRequest_senderId_status_createdAt_idx" ON "DirectMessageRequest"("senderId", "status", "createdAt");
ALTER TABLE "DirectMessageRequest" ADD CONSTRAINT "DirectMessageRequest_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessageRequest" ADD CONSTRAINT "DirectMessageRequest_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DirectChat" (
  "id" TEXT NOT NULL,
  "starterId" TEXT NOT NULL,
  "receiverId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DirectChat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DirectChat_starterId_receiverId_key" ON "DirectChat"("starterId", "receiverId");
CREATE INDEX "DirectChat_receiverId_updatedAt_idx" ON "DirectChat"("receiverId", "updatedAt");
ALTER TABLE "DirectChat" ADD CONSTRAINT "DirectChat_starterId_fkey" FOREIGN KEY ("starterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectChat" ADD CONSTRAINT "DirectChat_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DirectChatMessage" (
  "id" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "seenAt" TIMESTAMP(3),
  CONSTRAINT "DirectChatMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DirectChatMessage_chatId_createdAt_idx" ON "DirectChatMessage"("chatId", "createdAt");
ALTER TABLE "DirectChatMessage" ADD CONSTRAINT "DirectChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "DirectChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectChatMessage" ADD CONSTRAINT "DirectChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
